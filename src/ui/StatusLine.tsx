import React from 'react';
import { Box, Text } from 'ink';
import { PermissionMode } from '../config/types.js';

interface StatusLineProps {
  permissionMode: PermissionMode;
  tokensUsed: number;
  maxContextTokens?: number;
}

export const StatusLine: React.FC<StatusLineProps> = ({
  permissionMode,
  tokensUsed,
  maxContextTokens = 200000,
}) => {
  const percent = Math.min(100, Math.round((tokensUsed / maxContextTokens) * 100));
  const tokensK = (tokensUsed / 1000).toFixed(1);
  const maxK = (maxContextTokens / 1000).toFixed(0);

  let modeColor = 'cyan';
  let modeLabel = 'default';
  if (permissionMode === 'acceptEdits') {
    modeColor = 'yellow';
    modeLabel = 'accept-edits';
  } else if (permissionMode === 'plan') {
    modeColor = 'green';
    modeLabel = 'plan-mode';
  } else if (permissionMode === 'bypassPermissions') {
    modeColor = 'red';
    modeLabel = 'bypass-perms';
  }

  return (
    <Box flexDirection="row" justifyContent="space-between" marginTop={0} paddingX={1}>
      <Box gap={2}>
        <Text color="gray">? for shortcuts</Text>
        <Text color="gray">|</Text>
        <Text color="gray">
          Mode: <Text color={modeColor} bold>[{modeLabel}]</Text> <Text color="gray">(Shift+Tab to cycle)</Text>
        </Text>
      </Box>

      <Box>
        <Text color={percent > 80 ? 'yellow' : 'gray'}>
          Context: {tokensK}k/{maxK}k ({percent}%)
        </Text>
      </Box>
    </Box>
  );
};
