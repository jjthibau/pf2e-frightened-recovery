import assert from 'node:assert/strict';
import {test} from 'node:test';

const scope = 'pf2e-frightened-recovery';
const hooks = new Map();
globalThis.Hooks = {on: (event, action) => hooks.set(event, action), once() {}};
globalThis.foundry = {utils: {deepClone: structuredClone}};
const {endTurn} = await import('../scripts/main.js');

function flags(document) {
  const state = new Map();
  return Object.assign(document, {
    getFlag: (_scope, key) => state.get(key),
    async setFlag(_scope, key, value) { state.set(key, structuredClone(value)); },
    async unsetFlag(_scope, key) { state.delete(key); },
  });
}

function source(id, value, isLocked = false) {
  return {id, slug: 'frightened', isLocked, _source: {system: {value: {value}}}};
}

function fixture({failCondition, failAfterCard = false, dread = false} = {}) {
  const items = new Map([['a', source('a', 3)], ['b', source('b', 1)]]);
  const actor = flags({uuid: 'Actor.test', items, isDead: false, hasCondition: () => false,
    testUserPermission: () => true, get itemTypes() { return {condition: Array.from(items.values())}; },
  });
  const token = {uuid: 'Scene.test.Token.practice', actor, object: {hasSight: false}};
  const foe = {actor: {uuid: 'Actor.foe', items: [], isEnemyOf: () => true, hasCondition: () => false, wornArmor: {
    uuid: 'Actor.foe.Item.armor', isEquipped: true, system: {runes: {property: ['lesserDread']}},
  }}, object: {distanceTo: () => 10}, auras: new Map()};
  const scene = {tokens: dread ? [token, foe] : [token]};
  scene.tokens.get = () => token;
  token.scene = scene;
  const combatant = flags({id: 'combatant', token, flags: {pf2e: {}}});
  const encounter = {id: 'encounter', started: true, round: 2, combatants: [combatant]};
  const messages = new Map();
  Object.defineProperty(messages, 'contents', {get: () => Array.from(messages.values())});
  const writes = [];
  let interrupted = false;
  globalThis.game = {user: {isActiveGM: true}, settings: {get: () => true}, combats: [encounter],
    modules: new Map(), messages, users: [], pf2e: {ConditionManager: {
      async updateConditionValue(id, _actor, value) {
        writes.push([id, value]);
        if (value === 0) items.delete(id);
        else items.get(id)._source.system.value.value = value;
        if (id === failCondition && !interrupted) {
          interrupted = true;
          throw Error('response lost after write');
        }
      },
    }},
  };
  globalThis.canvas = {ready: true, scene};
  globalThis.ui = {notifications: {warn() {}, info() {}, error() {}}};
  globalThis.fromUuid = async uuid => uuid === token.uuid ? token : null;
  globalThis.ChatMessage = {getSpeaker: () => ({}), async create(data) {
    const id = String(messages.size + 1);
    const card = flags({id, async update(changes) { await this.setFlag(scope, 'recovery', changes[`flags.${scope}.recovery`]); }});
    await card.setFlag(scope, 'recovery', data.flags[scope].recovery);
    messages.set(id, card);
    if (failAfterCard && !interrupted) { interrupted = true; throw Error('card acknowledgement lost'); }
    return card;
  }};
  return {combatant, encounter, token, actor, writes, messages};
}

test('after a partial write, retry only the unfinished frightened source', async () => {
  const {combatant, encounter, writes} = fixture({failCondition: 'a'});
  await Promise.all([endTurn(combatant, encounter), endTurn(combatant, encounter)]);
  await endTurn(combatant, encounter);
  assert.deepEqual(writes, [['a', 2], ['b', 0]]);
});

test('recover an acknowledged card by turn key when the original response was lost', async () => {
  const {combatant, encounter, actor, messages, writes} = fixture({dread: true, failAfterCard: true});
  await endTurn(combatant, encounter);
  assert.equal(messages.size, 1);
  assert.equal(actor.getFlag(scope, 'pending'), messages.contents[0].id);
  assert.deepEqual(writes, []);
});

test('leave new and changed frightened sources for the GM while a save is outstanding', async () => {
  for (const change of [items => items.set('c', source('c', 4)), items => items.set('c', source('c', 4, true)), items => {
    items.get('a').isLocked = true;
  }]) {
    const {combatant, encounter, token, actor, messages, writes} = fixture({dread: true});
    await endTurn(combatant, encounter);
    change(actor.items);
    hooks.get('createChatMessage')({token, author: {}, flags: {pf2e: {context: {
      type: 'saving-throw', outcome: 'success', dc: {value: 20}, options: ['frightened-recovery:1:0'],
    }}}});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(messages.get('1').getFlag(scope, 'recovery').status, 'changed');
    assert.deepEqual(writes, []);
  }
});
