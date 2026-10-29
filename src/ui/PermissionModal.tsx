import React from 'react';
import { Box, Text, useInput } from 'ink';

export interface PermissionPromptData {
  toolName: string;
  arguments: Record<string, any>;
  onApprove: (remember: boolean) => void;
  onReject: (feedback?: string) => void;
}

interface PermissionModalProps {
  data: PermissionPromptData;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({ data }) => {
  useInput((input, key) => {
    if (input === '1' || key.return) {
      data.onApprove(false);
    } else if (input === '2') {
      data.onApprove(true);
    } else if (input === '3' || key.escape) {
      data.onReject();
    }
  });

  const argSummary = data.arguments.command || data.arguments.path || JSON.stringify(data.arguments);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      <Box marginBottom={1}>
        <Text bold color="yellow">
          ⚠️ Action requires approval: <Text color="white">{data.toolName}</Text>
        </Text>
      </Box>

      <Box marginBottom={1} paddingLeft={2}>
        <Text color="cyan">{argSummary}</Text>
      </Box>

      <Box flexDirection="column" gap={0}>
        <Text color="white">
          <Text bold color="green">1.</Text> Yes, allow this action
        </Text>
        <Text color="white">
          <Text bold color="cyan">2.</Text> Yes, and don't ask again for this command/session
        </Text>
        <Text color="white">
          <Text bold color="red">3.</Text> No, deny this action
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">Press 1, 2, or 3 (or Esc to deny)</Text>
      </Box>
    </Box>
  );
};
