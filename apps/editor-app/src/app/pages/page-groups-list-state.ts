export type DialogKind = 'new' | 'delete' | 'move' | 'move-to-parent';

export interface PageGroupsListState {
  /** The pages ticked, in the order they were ticked. Ids of pages no longer on screen may linger; the view only counts the ones it can see. */
  selectedGroupIds: readonly string[];
  openDialog: DialogKind | 'none';
  actionError: string;
}

export const initialState: PageGroupsListState = {
  selectedGroupIds: [],
  openDialog: 'none',
  actionError: '',
};

export type PageGroupsListAction =
  | { type: 'TOGGLE_SELECTED'; groupId: string }
  | { type: 'SELECT_ALL'; groupIds: readonly string[] }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'OPEN_DIALOG'; dialog: DialogKind }
  | { type: 'CLOSE_DIALOG' }
  | { type: 'SET_ERROR'; error: string };

// Same exclusive-dialog-state discipline as pages-list-view.tsx's own
// reducer, same reason: a single `openDialog` makes "delete dialog stuck
// open for the wrong row" structurally impossible.
export function pageGroupsListReducer(
  state: PageGroupsListState,
  action: PageGroupsListAction,
): PageGroupsListState {
  switch (action.type) {
    case 'TOGGLE_SELECTED':
      return {
        selectedGroupIds: state.selectedGroupIds.includes(action.groupId)
          ? state.selectedGroupIds.filter((id) => id !== action.groupId)
          : [...state.selectedGroupIds, action.groupId],
        openDialog: 'none',
        actionError: '',
      };
    case 'SELECT_ALL':
      return {
        selectedGroupIds: action.groupIds,
        openDialog: 'none',
        actionError: '',
      };
    case 'CLEAR_SELECTION':
      return { ...state, selectedGroupIds: [], actionError: '' };
    case 'OPEN_DIALOG':
      return { ...state, openDialog: action.dialog };
    case 'CLOSE_DIALOG':
      return { ...state, openDialog: 'none' };
    case 'SET_ERROR':
      return { ...state, actionError: action.error };
  }
}
