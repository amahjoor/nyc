// Injected only by the development server. The Steam package has no toggle.
const active=location.pathname.startsWith('/__puns/');
const button=document.createElement('button');
button.type='button';
button.className='pause-option';
button.dataset.help='Switch names and reload the city for internal comparison. Saved purchases and earnings carry over.';
button.setAttribute('aria-pressed',String(active));
const label=document.createElement('span'), value=document.createElement('b');
label.textContent='Business and fashion names';
value.textContent=active?'PUNS':'REAL';
button.append(label,value);
document.getElementById('hours-button').after(button);
button.addEventListener('click',()=>{
  document.cookie='cj-review='+(active?'real':'puns')+'; Path=/; SameSite=Strict; Max-Age=31536000';
  location.assign((active?'/':'/__puns/')+location.search+location.hash);
});
