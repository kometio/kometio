import { describe, expect, it } from 'vitest';
import {
  initialState,
  pageGroupsListReducer,
  type PageGroupsListState,
} from './page-groups-list-state';

const withTwo: PageGroupsListState = {
  ...initialState,
  selectedGroupIds: ['a', 'b'],
};

describe('pageGroupsListReducer', () => {
  it('ticks a page, and unticks it on the second time', () => {
    const ticked = pageGroupsListReducer(initialState, {
      type: 'TOGGLE_SELECTED',
      groupId: 'a',
    });
    expect(ticked.selectedGroupIds).toEqual(['a']);

    const unticked = pageGroupsListReducer(ticked, {
      type: 'TOGGLE_SELECTED',
      groupId: 'a',
    });
    expect(unticked.selectedGroupIds).toEqual([]);
  });

  it('keeps as many pages ticked as were ticked, in that order', () => {
    const state = pageGroupsListReducer(
      pageGroupsListReducer(initialState, {
        type: 'TOGGLE_SELECTED',
        groupId: 'b',
      }),
      { type: 'TOGGLE_SELECTED', groupId: 'a' },
    );

    expect(state.selectedGroupIds).toEqual(['b', 'a']);
  });

  it('ticks every page at once, and clears them', () => {
    const all = pageGroupsListReducer(initialState, {
      type: 'SELECT_ALL',
      groupIds: ['a', 'b', 'c'],
    });
    expect(all.selectedGroupIds).toEqual(['a', 'b', 'c']);

    expect(
      pageGroupsListReducer(all, { type: 'CLEAR_SELECTION' }).selectedGroupIds,
    ).toEqual([]);
  });

  it('forgets the last error, and closes a dialog, when the selection changes', () => {
    const stale: PageGroupsListState = {
      ...withTwo,
      openDialog: 'delete',
      actionError: 'Non è stato possibile eliminare la pagina.',
    };

    const next = pageGroupsListReducer(stale, {
      type: 'TOGGLE_SELECTED',
      groupId: 'c',
    });

    expect(next.openDialog).toBe('none');
    expect(next.actionError).toBe('');
  });

  it('keeps the dialog it is asked to, and the selection under it', () => {
    const opened = pageGroupsListReducer(withTwo, {
      type: 'OPEN_DIALOG',
      dialog: 'move',
    });
    expect(opened.openDialog).toBe('move');
    expect(opened.selectedGroupIds).toEqual(['a', 'b']);

    expect(
      pageGroupsListReducer(opened, { type: 'CLOSE_DIALOG' }).selectedGroupIds,
    ).toEqual(['a', 'b']);
  });
});
