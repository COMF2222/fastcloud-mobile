const locks = new Set<symbol>();
let previous = '';
/** Nested dialogs share one lock; cleanup order cannot leave the page stuck. */
export function lockPageScroll(): () => void {
  const token = Symbol('dialog');
  if (locks.size === 0) previous = document.body.style.overflow;
  locks.add(token);
  document.body.style.overflow = 'hidden';
  return () => {
    if (!locks.delete(token)) return;
    if (locks.size === 0) document.body.style.overflow = previous;
  };
}
