// Keep activation in sync with contact from the holding thumb.
export function createThumbPress(handset, layer, onTap, reducedMotion, showTap = () => true) {
  const view = handset.ownerDocument?.defaultView;
  const canDraw = Boolean(view && layer?.setAttribute);
  let button = null, lifting = false, pendingAction = null;
  let contactTimer, actionTimer, liftTimer;
  let contactTime = 0;

  function cancel() {
    clearTimeout(contactTimer);
    clearTimeout(actionTimer);
    clearTimeout(liftTimer);
    pendingAction = null;
    button?.removeAttribute?.('data-pressing');
    button = null;
    lifting=false;
    if(canDraw)layer.setAttribute('data-pose','reach');
  }

  function commit() {
    clearTimeout(actionTimer);
    const action = pendingAction;
    pendingAction = null;
    action?.();
  }

  function withdraw() {
    clearTimeout(contactTimer);
    clearTimeout(liftTimer);
    if (!button) return;
    button.removeAttribute('data-pressing');
    button = null;

    lifting=true;
    layer.setAttribute('data-pose','reach');
    liftTimer=setTimeout(cancel,reducedMotion()?0:150);
  }

  function reach(control, event) {
    if (pendingAction) commit();
    if (control.disabled || control.closest?.('[hidden]')) return false;
    const frame = handset.getBoundingClientRect?.();
    const rect = control.getBoundingClientRect?.();
    if (!frame?.width || !frame.height || !rect?.width || !rect.height) return false;

    const pointer = event && (event.pointerType || event.detail > 0 || event.type === 'pointerdown') &&
      Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
    const clientX = pointer ? Math.max(rect.left, Math.min(rect.right, event.clientX)) : rect.left + rect.width / 2;
    const clientY = pointer ? Math.max(rect.top, Math.min(rect.bottom, event.clientY)) : rect.top + rect.height / 2;
    const x = (clientX - frame.left) / frame.width, y = (clientY - frame.top) / frame.height;
    if (!showTap()) return false;
    const instant=reducedMotion();
    const reachMs=onTap(x,y,instant);
    if (!canDraw) return false;

    cancel();
    button=control;
    control.setAttribute('data-pressing','');
    const duration = instant ? 0 : (reachMs ?? 85);
    contactTime = performance.now() + duration;
    if (duration) {
      contactTimer = setTimeout(() => layer.setAttribute('data-pose', 'press'), duration);
    } else {
      layer.setAttribute('data-pose', 'press');
    }
    return true;
  }

  function press(control, event, action) {
    if (button !== control && !reach(control, event)) {
      action();
      return;
    }
    if (pendingAction) return;
    clearTimeout(liftTimer);
    pendingAction = action;
    // Show contact on the original screen before its action opens the next one.
    const delay = reducedMotion() ? 0 : Math.max(0, contactTime - performance.now()) + 36;
    if (delay) actionTimer = setTimeout(commit, delay);
    else commit();
    if (button) liftTimer = setTimeout(withdraw, delay + 55);
  }

  function release() {
    if (button && !pendingAction) {
      liftTimer = setTimeout(withdraw, Math.max(0, contactTime - performance.now()) + 70);
    }
  }
  return { reach, press, release, withdraw, cancel, get phase() { return button ? 'pressing' : lifting ? 'lifting' : 'idle'; } };
}
