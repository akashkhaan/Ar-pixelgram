import React, { forwardRef, useImperativeHandle } from 'react';
import { useGroupCall, CallKind } from '@/contexts/GroupCallContext';
import type { GroupMember } from '@/types/groups';

export type { CallKind };

export interface GroupCallPanelHandle {
  startCall: (kind: CallKind) => Promise<void>;
  isCallActive: () => boolean;
}

interface GroupCallPanelProps {
  groupId: string;
  groupName?: string;
  groupAvatarUrl?: string | null;
  members: GroupMember[];
}

export const GroupCallPanel = forwardRef<GroupCallPanelHandle, GroupCallPanelProps>(
  ({ groupId, groupName, groupAvatarUrl, members }, ref) => {
    const groupCall = useGroupCall();

    useImperativeHandle(
      ref,
      () => ({
        startCall: async (kind: CallKind) => {
          await groupCall.startCall(groupId, groupName || 'Group Call', groupAvatarUrl, members, kind);
        },
        isCallActive: () => groupCall.active && groupCall.groupId === groupId,
      }),
      [groupCall, groupId, groupName, groupAvatarUrl, members],
    );

    // GroupCallOverlay mounted at root App level renders the entire full-screen and floating UI
    return null;
  },
);

GroupCallPanel.displayName = 'GroupCallPanel';
export default GroupCallPanel;
