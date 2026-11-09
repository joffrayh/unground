/** When the brew form's nav folds away into the save pill (D38). */

export const COLLAPSE_AFTER = 40;
export const EXPAND_AFTER = 24;

export interface CollapseState {
	collapsed: boolean;
	/** The furthest point reached in the current direction. */
	anchor: number;
}

/** `maxY` clamps the scroll position so iOS's overscroll bounce doesn't read as a change of direction. */
export function nextCollapse(state: CollapseState, scrollY: number, maxY: number): CollapseState {
	const y = Math.min(Math.max(0, maxY), Math.max(0, scrollY));
	if (y <= EXPAND_AFTER) return { collapsed: false, anchor: y };
	if (state.collapsed) {
		if (y > state.anchor) return { collapsed: true, anchor: y };
		return state.anchor - y >= EXPAND_AFTER ? { collapsed: false, anchor: y } : state;
	}
	if (y < state.anchor) return { collapsed: false, anchor: y };
	return y - state.anchor >= COLLAPSE_AFTER ? { collapsed: true, anchor: y } : state;
}
