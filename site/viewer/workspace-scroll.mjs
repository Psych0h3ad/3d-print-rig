// The inspector scrolls vertically. Native form focus (including iOS select
// pickers) must not leave the entire panel panned sideways, even with overflow
// hidden. Listen on this container only; nested tables keep their own scrolling.
export function lockInspectorHorizontalScroll(content) {
  const reset = () => {
    if (content.scrollLeft !== 0) content.scrollLeft = 0;
  };
  content.addEventListener('scroll', reset, {passive: true});
  content.addEventListener('focusin', reset);
  reset();
  return reset;
}
