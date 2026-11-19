import {DREAD,recoveryValue,recoveryFloor} from './rules.js';
const ID='pf2e-frightened-recovery',busy=new Set();let queue=Promise.resolve();
const gm=()=>game.user.isActiveGM;
const enqueue=f=>{queue=queue.then(f).catch(error=>{console.error(ID,error);ui.notifications.error('Frightened recovery needs GM attention; see the console.');});return queue;};
const flag=m=>m?.getFlag(ID,'recovery');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const outcomes=new Set(['criticalFailure','failure','success','criticalSuccess']);
function visible(observer,target){
 const actor=observer.actor;
 if(actor.hasCondition('blinded')||actor.hasCondition('unconscious')||target.hidden||target.actor.hasCondition('invisible'))return false;
 // A disabled NPC sight source is not evidence of blindness. Ask the GM rather than silently ignoring the rune.
 if(!observer.object?.hasSight)return null;
 let source;
 try{
  source=new CONFIG.Canvas.visionSourceClass({sourceId:observer.uuid+'.frightened',object:observer.object});
  Object.assign(source.blinded,observer.object._getVisionBlindedStates());source.initialize(observer.object._getVisionSourceData());
  const config=canvas.visibility._createVisibilityTestConfig(target.object.document.getVisibilityTestPoints(),{object:target.object,tolerance:0});
  return ['basicSight','lightPerception'].some(id=>{const mode=observer.detectionModes[id];return mode&&CONFIG.Canvas.detectionModes[id].testVisibility(source,mode,config)===true;});
 }catch{return null;}finally{source?.destroy();}
}
function restrictions(token){
 const actor=token.actor,override=actor.getFlag(ID,'override')??{},reasons=[];let floor=Number(override.minimum)||0;
 if(override.hold)reasons.push('GM hold');if(floor)reasons.push('GM minimum '+floor);
 const sources=[];
 for(const source of token.scene.tokens){
  const origin=source.actor;if(!origin||source===token||!origin.isEnemyOf(actor)||!source.object||source.hidden)continue;
  for(const aura of source.auras.values()){
   const despair=origin.items.some(i=>i.slug==='aura-of-despair')&&aura.slug==='champions-aura';
   const dirge=aura.slug==='dirge-of-doom';
   if((despair||dirge&&!actor.hasCondition('deafened'))&&aura.containsToken(token)){floor=Math.max(floor,1);reasons.push(despair?'Aura of Despair':'Dirge of Doom');}
  }
  const armor=origin.wornArmor;
  if(!armor?.isEquipped||armor.isInvested===false||source.object.distanceTo(token.object)>30)continue;
  const grades=armor.system.runes.property.filter(r=>r in DREAD);
  if(!grades.length)continue;
  const sight=visible(token,source);if(sight===false)continue;
  for(const grade of grades)sources.push({...DREAD[grade],grade,itemUUID:armor.uuid,originUUID:origin.uuid,uncertain:sight===null,outcome:null});
 }
 return {floor,hold:!!override.hold,reasons,sources};
}
function frightenedSources(actor){
 return actor.itemTypes.condition.filter(item=>item.slug==='frightened').map(item=>({
  id:item.id,value:item._source.system.value.value,locked:Boolean(item.isLocked),
 }));
}
function recoveryPlan(request){
 const floor=recoveryFloor(request.floor,request.value,request.sources);
 return request.conditions.map(source=>({...source,next:recoveryValue(source.value,floor,request.hold)}));
}
function matchesSources(actor,request,plan){
 const current=new Map(frightenedSources(actor).map(source=>[source.id,source]));
 const expected=request.allConditions??request.conditions;
 if(current.size>expected.length)return false;
 const nextValues=new Map(plan.map(source=>[source.id,source.next]));
 for(const source of expected){
  const actual=current.get(source.id),next=nextValues.get(source.id);
  if(actual?(actual.locked!==Boolean(source.locked)||actual.value!==source.value&&actual.value!==next):next!==0)return false;
  current.delete(source.id);
 }
 return current.size===0;
}
async function finish(message,request){
 const token=await fromUuid(request.targetUUID),actor=token?.actor;
 const plan=request.plan??[];
 // A plan persisted before mutation can recognize previously completed writes.
 // Before a plan exists, any changed source requires GM review.
 if(!actor||request.actorUUID&&actor.uuid!==request.actorUUID||!matchesSources(actor,request,plan)){
  request.status='changed';request.note='Frightened changed while recovery was pending; resolve this turn manually.';
 }else{
  const floor=recoveryFloor(request.floor,request.value,request.sources);
  if(message&&!request.plan){
   request.plan=recoveryPlan(request);
   await message.setFlag(ID,'recovery',request);
  }
  for(const source of request.plan??recoveryPlan(request)){
   const condition=actor.items.get(source.id);
   if(condition?._source.system.value.value===source.value&&source.next!==source.value){
    await game.pf2e.ConditionManager.updateConditionValue(source.id,actor,source.next);
    const updated=actor.items.get(source.id);
    if(source.next===0?updated:updated?._source.system.value.value!==source.next){
     throw Error('The frightened recovery write was not confirmed.');
    }
   }
  }
  request.status='resolved';request.result=recoveryValue(request.value,floor,request.hold);
  request.note=request.result===request.value?'Recovery held: '+([...request.reasons,...request.sources.filter(s=>s.outcome==='failure'||s.outcome==='criticalFailure').map(()=> 'Dread rune')].join(', ')||'minimum frightened'):`Frightened ${request.value} → ${request.result}`;
 }
 if(message)await message.update({[`flags.${ID}.recovery`]:request,content:content(request)});
 if(message&&actor?.getFlag(ID,'pending')===message.id)await actor.unsetFlag(ID,'pending');
}
function content(r){
 const dcVisible=game.settings.get('pf2e','metagame_showDC');
 const note=r.status==='pending'?'Resolve the Dread rune save before frightened decreases.':r.status==='changed'?'GM: resolve this recovery manually.':'Recovery resolved.';
 return `<section class="frightened-recovery"><strong>Frightened Recovery</strong><p>${note}</p>${r.sources.map((s,i)=>`<div>${s.outcome?'Will save resolved.':`<button type="button" data-frightened-save="${i}">Roll Will Save${dcVisible?' (DC '+s.dc+')':''}</button>`}${s.uncertain&&!s.outcome?'<p>GM: confirm the creature can see the rune wearer, or ignore this rune.</p>':''}</div>`).join('')}</section>`;
}
async function applyTurn(combatant,encounter,round){
 if(!gm()||!game.settings.get(ID,'enabled')||!encounter.started||game.modules.get('xdy-pf2e-workbench')?.active)return;
 const candidate=canvas.scene?.tokens.get(combatant.tokenId);
 const token=combatant.token??(!combatant.sceneId&&candidate?.actorId===combatant.actorId?candidate:null),actor=token?.actor;
 if(!actor||actor.isDead||!canvas.ready||token.scene!==canvas.scene)return;
 if(combatant.getFlag(ID,'lastRound')===round)return;
 const turnKey=`${encounter.id}:${combatant.id}:${round}`;
 const saved=combatant.getFlag(ID,'recoveryWork');
 const prior=game.messages.get(actor.getFlag(ID,'pending'));
 let r=saved?.turnKey===turnKey?foundry.utils.deepClone(saved):null;
 if(!r){
  if(saved&&saved.round!==combatant.getFlag(ID,'lastRound')){
   await applyTurn(combatant,encounter,saved.round);
   if(combatant.getFlag(ID,'lastRound')===round)return;
  }
  if(flag(prior)?.status==='pending')return;
  const allConditions=frightenedSources(actor);
  const value=Math.max(0,...allConditions.map(source=>source.value??0));
  const conditions=allConditions.filter(source=>!source.locked);
  if(!value||!conditions.length)return;
  const limits=restrictions(token),locked=Math.max(0,...allConditions.filter(source=>source.locked).map(source=>source.value??0));
  if(locked){limits.floor=Math.max(limits.floor,locked);limits.reasons.push('parent-granted frightened minimum');}
  r={status:'pending',targetUUID:token.uuid,actorUUID:actor.uuid,turnKey,round,conditions,allConditions,value,...limits};
  if(r.hold||!r.sources.length)r.plan=recoveryPlan(r);
  await combatant.setFlag(ID,'recoveryWork',r);
  if(combatant.getFlag(ID,'recoveryWork')?.turnKey!==turnKey)throw Error('The frightened recovery plan was not saved.');
 }
 if(r.plan){
  await finish(null,r);
  if(r.status==='changed'||r.hold||r.floor)ui.notifications.info(r.note);
 }else{
  const existing=game.messages.contents.find(message=>flag(message)?.turnKey===turnKey);
  const message=existing??await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor,token}),content:content(r),whisper:r.sources.some(s=>s.uncertain)?game.users.filter(u=>u.isGM).map(u=>u.id):[],flags:{[ID]:{recovery:r}}});
  if(!message)throw Error('Frightened recovery card was not created.');
  if(flag(message)?.status==='pending'&&prior?.id!==message.id)await actor.setFlag(ID,'pending',message.id);
 }
 await combatant.setFlag(ID,'lastRound',round);
}
const turnsInProgress=new Map();
export async function endTurn(combatant,encounter,round=combatant.flags.pf2e.roundOfLastTurnEnd??encounter.round){
 const key=`${encounter.id}:${combatant.id}`;
 if(turnsInProgress.has(key))return turnsInProgress.get(key);
 const work=Promise.resolve().then(async()=>{
  try{await applyTurn(combatant,encounter,round);}
  catch{await applyTurn(combatant,encounter,round);}
 });
 turnsInProgress.set(key,work);
 try{await work;}finally{turnsInProgress.delete(key);}
}
async function recoverInterrupted(){
 if(!gm()||!game.settings.get(ID,'enabled')||game.modules.get('xdy-pf2e-workbench')?.active||!canvas.ready)return;
 for(const encounter of game.combats){
  if(!encounter.started)continue;
  for(const combatant of encounter.combatants){
   const work=combatant.getFlag(ID,'recoveryWork');
   if(work&&work.round!==combatant.getFlag(ID,'lastRound'))await endTurn(combatant,encounter,work.round);
  }
 }
 for(const token of canvas.scene.tokens){
  const actor=token.actor,card=game.messages.get(actor?.getFlag(ID,'pending')),request=flag(card);
  if(request?.targetUUID===token.uuid&&request.status==='pending'&&request.sources.every(source=>source.outcome)){
   await finish(card,foundry.utils.deepClone(request));
  }
 }
}
export async function rollSave(message,index,event){
 const r=flag(message),token=r&&await fromUuid(r.targetUUID),actor=token?.actor,key=message.id+':'+index;
 if(!r||r.status!=='pending'||!actor?.isOwner||r.sources[index]?.outcome||busy.has(key))return;
 busy.add(key);
 try{
  const s=r.sources[index],origin=await fromUuid(s.originUUID);if(!origin)return;
  const item=new CONFIG.Item.documentClass({name:'Dread Rune',type:'effect',system:{traits:{value:['emotion','fear','mental','visual']}}},{parent:origin});
  return await actor.saves.will.check.roll({dc:{value:s.dc},token,origin,item,event,extraRollOptions:['frightened-recovery:'+message.id+':'+index]});
 }finally{busy.delete(key);}
}
async function result(message){
 if(!gm()||!game.settings.get(ID,'enabled'))return;const c=message.flags.pf2e?.context;
 if(c?.type!=='saving-throw'||!outcomes.has(c.outcome))return;
 const tag=c.options?.find(s=>s.startsWith('frightened-recovery:'));if(!tag)return;
 const[,id,idx]=tag.split(':'),card=game.messages.get(id),index=Number(idx);
 const saved=flag(card),r=saved&&foundry.utils.deepClone(saved),s=r?.sources[index];
 if(r?.status!=='pending'||!s||s.outcome||c.dc?.value!==s.dc)return;
 const token=await fromUuid(r.targetUUID);
 if(message.token?.uuid!==r.targetUUID||!token?.actor?.testUserPermission(message.author,'OWNER'))return;
 s.outcome=c.outcome;await card.setFlag(ID,'recovery',r);
 if(r.sources.every(s=>s.outcome))await finish(card,r);else await card.update({content:content(r)});
}
async function configure(actor){
 const current=actor.getFlag(ID,'override')??{};
 const value=await foundry.applications.api.DialogV2.wait({window:{title:'Frightened Recovery'},content:`<p>Special fear effects can override automatic recovery.</p><div class="form-group"><label>Minimum frightened</label><input name="minimum" type="number" min="0" max="100" value="${Number(current.minimum)||0}"></div><label><input name="hold" type="checkbox" ${current.hold?'checked':''}> Hold all automatic recovery</label>`,buttons:[{action:'save',label:'Save',default:true,callback:(_e,b)=>({minimum:Number(b.form.elements.minimum.value),hold:b.form.elements.hold.checked})}],close:()=>null,rejectClose:false});
 if(value&&Number.isInteger(value.minimum)&&value.minimum>=0&&value.minimum<=100)await actor.setFlag(ID,'override',value);
}
Hooks.once('init',()=>game.settings.register(ID,'enabled',{name:'Automatic frightened recovery',hint:'Reduce frightened at the end of turns, respecting supported exceptions. Automatically pauses if PF2e Workbench is active to avoid double recovery.',scope:'world',config:true,type:Boolean,default:true}));
Hooks.on('pf2e.endTurn',(c,e)=>{if(gm())void enqueue(()=>endTurn(c,e));});
Hooks.on('createChatMessage',m=>{if(gm())void enqueue(()=>result(m));});
Hooks.on('canvasReady',()=>{if(gm())void enqueue(recoverInterrupted);});
Hooks.on('updateUser',(_user,changes)=>{if(gm()&&('active' in changes))void enqueue(recoverInterrupted);});
Hooks.on('getActorSheetHeaderButtons',(sheet,buttons)=>{if(game.user.isGM)buttons.unshift({label:'Frightened',class:'frightened-recovery-config',icon:'fa-solid fa-ghost',onclick:()=>configure(sheet.actor)});});
Hooks.on('renderChatMessageHTML',(message,html)=>{
 const r=flag(message);if(!r)return;
 const token=fromUuidSync(r.targetUUID),actor=token?.actor;
 if(game.user.isGM&&r.note){const note=document.createElement('p');note.className='frightened-gm-note';note.textContent=r.note;html.querySelector('.frightened-recovery')?.append(note);}
 for(const button of html.querySelectorAll('[data-frightened-save]')){
  button.disabled=r.status!=='pending'||!actor?.isOwner;
  button.addEventListener('click',e=>{e.stopPropagation();void rollSave(message,Number(button.dataset.frightenedSave),e);});
 }
 if(game.user.isGM&&r.status==='pending'){
  const row=document.createElement('div');row.className='frightened-gm-controls';
  for(const[action,label]of [['ignore','Ignore runes / decrease'],['hold','Hold this turn']]){
   const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',e=>{e.stopPropagation();void enqueue(async()=>{const current=flag(message);if(current?.status!=='pending')return;current.hold=action==='hold';for(const s of current.sources)s.outcome='success';if(current.hold)current.reasons.push('GM decision');await finish(message,current);});});row.append(b);
  }html.querySelector('.frightened-recovery')?.append(row);
 }
});
Hooks.once('ready',()=>{game.modules.get(ID).api=Object.freeze({endTurn,restrictions,rollSave,idle:()=>queue,configure});if(game.modules.get('xdy-pf2e-workbench')?.active&&game.user.isGM)ui.notifications.warn('Frightened Recovery is paused while PF2e Workbench is active to prevent double recovery.');});
