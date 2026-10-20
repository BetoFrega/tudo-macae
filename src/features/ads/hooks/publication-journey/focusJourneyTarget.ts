export function focusJourneyTarget(id: string) {
  requestAnimationFrame(() => {
    const target = document.getElementById(id);
    if (!target) return;
    target.focus({ preventScroll: true });
    const header = document.querySelector("header.sticky");
    const inset = (header?.getBoundingClientRect().height ?? 0) + 16;
    const bounds = target.getBoundingClientRect();
    if (bounds.top < inset || bounds.bottom > window.innerHeight) {
      window.scrollTo({ top: Math.max(0, window.scrollY + bounds.top - inset), behavior: "instant" });
    }
  });
}
