// The prospect's business and objection determine the conversation and commission.
const leads=[
  ['Harbor Florals','June','We miss orders when the shop is busy.','Online order form','We already have a website.','Offer to embed it on their site'],
  ['Mercer Coffee','Alex','Our regulars keep losing paper punch cards.','Digital loyalty card','We can’t slow down the morning line.','Show the one-tap checkout'],
  ['Bridge Bike Repair','Dana','Everyone calls to ask whether their bike is ready.','Repair status texts','My mechanics don’t have time to write texts.','Demonstrate automatic pickup messages'],
  ['Canal Laundry','Vic','Customers forget their pickup times.','Pickup reminders','We already keep a pickup calendar.','Offer a calendar import'],
];
const pitches=leads.map(lead=>lead[3]);
export function salesCall(work){
  const r=work.record,call=r.call,serial=r.calls;
  const [business,contact,need,pitch,objection,reply]=leads[serial%leads.length];
  const list=(message,rows)=>work.list('Business sales',message,rows);
  const row=(name,note,fn)=>({name,note,choose:()=>{
    if(r!==work.record || r.calls!==serial || r.call!==call)return;
    fn();
  }});
  const advance=(stage)=>{r.call=stage;work.save();salesCall(work);};
  function log(outcome){
    const commission=outcome==='Trial booked'?32:0;
    r.calls++;r.call=null;r.lastCall=business+' · '+outcome;
    work.sim.cash+=commission;work.save(commission?'Sales commission':undefined);salesCall(work);
  }
  if(!call)return list((r.lastCall?r.lastCall+'. ':'')+'Next lead · '+business+' · Ask for '+contact+'. $32 per booked trial.',[
    row('Dial '+business,'Local business line',()=>advance('hello'))]);
  const hang=row('End call','Log as declined',()=>log('Declined'));
  if(call==='hello')return list(contact+' speaking. What’s this about?',[
    row('Introduce yourself and ask about their day','Identify a business need',()=>advance('discovery')),hang]);
  if(call==='discovery')return list(contact+' · “'+need+'”',pitches.map(product=>row('Offer '+product,'',()=>advance(product===pitch?'objection':'declined'))).concat(hang));
  if(call==='objection')return list(contact+' · “'+objection+'”',[
    row(reply,'Address their concern',()=>advance('close')),row('Repeat the price','',()=>advance('declined')),hang]);
  if(call==='close')return list(contact+' · “That could work. Send me a time for the trial.”',[
    row('Book trial and log the sale','Sales commission +$32',()=>log('Trial booked')),row('Log a callback','No commission yet',()=>log('Callback requested'))]);
  return list(contact+' · “That isn’t what we need. Thanks for calling.”',[row('Log declined lead','Move to the next business',()=>log('Declined'))]);
}
