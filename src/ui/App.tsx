import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { Banner } from './Banner.js';
import { MarkdownView } from './MarkdownView.js';
import { ToolCallView } from './ToolCallView.js';
import { SpinnerView } from './SpinnerView.js';
import { TodoListView } from './TodoListView.js';
import { StatusLine } from './StatusLine.js';
import { InputBox } from './InputBox.js';
import { PermissionModal, PermissionPromptData } from './PermissionModal.js';
import { AgentLoop } from '../agent/loop.js';
import { AgentEvent, ToolExecutionResult } from '../agent/types.js';
import { PermissionMode } from '../config/types.js';
import { ToolRegistry } from '../tools/registry.js';

interface MessageDisplay {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content?: string;
  toolCallLine?: string;
  toolResult?: ToolExecutionResult;
}

interface AppProps {
  agentLoop: AgentLoop;
  toolRegistry: ToolRegistry;
  initialPrompt?: string;
  version?: string;
  model?: string;
  cwd?: string;
  permissionMode?: PermissionMode;
  onPermissionChange?: (mode: PermissionMode) => void;
  onCommand?: (command: string) => Promise<boolean>;
}

export const App: React.FC<AppProps> = ({
  agentLoop,
  toolRegistry,
  initialPrompt,
  version = '1.0.0',
  model = 'claude-3-5-sonnet',
  cwd = process.cwd(),
  permissionMode: initialPermissionMode = 'default',
  onPermissionChange,
  onCommand,
}) => {
  const [messages, setMessages] = useState<MessageDisplay[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [spinnerVerb, setSpinnerVerb] = useState('Thinking');
  const [spinnerStartTime, setSpinnerStartTime] = useState(0);
  const [tokensUsed, setTokensUsed] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(initialPermissionMode);
  const [permissionPrompt, setPermissionPrompt] = useState<PermissionPromptData | null>(null);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  // Streaming assistant message state
  const currentStreamRef = useRef<string>('');

  const cyclePermissionMode = () => {
    const modes: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions'];
    const nextIdx = (modes.indexOf(permissionMode) + 1) % modes.length;
    const nextMode = modes[nextIdx];
    setPermissionMode(nextMode);
    if (onPermissionChange) onPermissionChange(nextMode);
  };

  const handleInterrupt = () => {
    agentLoop.interrupt();
    setIsGenerating(false);
  };

  const handleRewind = () => {
    // Rewind last interaction
    if (messages.length >= 2) {
      setMessages(prev => prev.slice(0, -2));
    }
  };

  const handleUserInput = async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Check slash commands or custom handler
    if (trimmed.startsWith('/') && onCommand) {
      const handled = await onCommand(trimmed);
      if (handled) return;
    }

    // Direct bash shortcut `!cmd`
    if (trimmed.startsWith('!')) {
      const bashCmd = trimmed.slice(1).trim();
      setMessages(prev => [
        ...prev,
        { id: `u_${Date.now()}`, role: 'user', content: trimmed },
        { id: `c_${Date.now()}`, role: 'tool', toolCallLine: `● Bash("${bashCmd}")` },
      ]);
      const res = await toolRegistry.execute('Bash', { command: bashCmd }, agentLoop.context);
      setMessages(prev => [
        ...prev,
        {
          id: `r_${Date.now()}`,
          role: 'tool',
          toolResult: {
            toolCallId: 'direct_bash',
            name: 'Bash',
            arguments: { command: bashCmd },
            output: res.output,
            isError: res.isError,
            durationMs: 0,
          },
        },
      ]);
      return;
    }

    // Add user message to display
    setMessages(prev => [
      ...prev,
      { id: `u_${Date.now()}`, role: 'user', content: trimmed },
    ]);
    setInputHistory(prev => [...prev, trimmed]);

    setIsGenerating(true);
    setSpinnerStartTime(Date.now());
    currentStreamRef.current = '';

    const assistantMsgId = `asst_${Date.now()}`;

    try {
      const finalResult = await agentLoop.run(trimmed, async (event: AgentEvent) => {
        if (event.type === 'thinking_start') {
          setSpinnerVerb(event.verb);
        } else if (event.type === 'token') {
          currentStreamRef.current += event.text;
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.id === assistantMsgId) {
              return [
                ...prev.slice(0, -1),
                { ...last, content: currentStreamRef.current },
              ];
            } else {
              return [
                ...prev,
                { id: assistantMsgId, role: 'assistant', content: currentStreamRef.current },
              ];
            }
          });
        } else if (event.type === 'error') {
          // Display error directly to the user!
          setMessages(prev => [
            ...prev,
            { id: `err_${Date.now()}`, role: 'assistant', content: `**⚠️ Error:** ${event.message}` },
          ]);
        } else if (event.type === 'tool_execution_start') {
          const callLine = toolRegistry.renderCall(event.name, event.arguments);
          setMessages(prev => [
            ...prev,
            { id: `tcall_${event.id}`, role: 'tool', toolCallLine: callLine },
          ]);
        } else if (event.type === 'tool_execution_end') {
          setMessages(prev => [
            ...prev,
            {
              id: `tres_${event.result.toolCallId}`,
              role: 'tool',
              toolResult: event.result,
            },
          ]);
        } else if (event.type === 'usage') {
          setTokensUsed(event.usage.totalTokens);
          setTotalCost(event.cost);
        } else if (event.type === 'agent_stop') {
          setIsGenerating(false);
        }
      });

      // If final response was not streamed as individual tokens, display it
      if (!currentStreamRef.current && finalResult) {
        setMessages(prev => [
          ...prev,
          { id: assistantMsgId, role: 'assistant', content: finalResult },
        ]);
      }
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        { id: `err_${Date.now()}`, role: 'assistant', content: `**⚠️ Error:** ${err.message || String(err)}` },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Run initial prompt if provided
  useEffect(() => {
    if (initialPrompt) {
      handleUserInput(initialPrompt);
    }
  }, []);

  return (
    <Box flexDirection="column" padding={1}>
      {/* Banner */}
      <Banner version={version} model={model} cwd={cwd} />

      {/* Message History */}
      <Box flexDirection="column" marginY={1}>
        {messages.map(msg => {
          if (msg.role === 'user') {
            return (
              <Box key={msg.id} marginY={0}>
                <Text color="#FF6B35" bold>{'> '}</Text>
                <Text color="white" bold>{msg.content}</Text>
              </Box>
            );
          }

          if (msg.role === 'assistant') {
            return (
              <Box key={msg.id} marginY={0} flexDirection="column">
                <MarkdownView content={msg.content || ''} />
              </Box>
            );
          }

          if (msg.role === 'tool') {
            if (msg.toolCallLine) {
              return (
                <Box key={msg.id} marginY={0}>
                  <Text color="#FF6B35">{msg.toolCallLine}</Text>
                </Box>
              );
            }
            if (msg.toolResult) {
              return (
                <Box key={msg.id} marginY={0}>
                  <ToolCallView
                    callLine=""
                    result={msg.toolResult}
                    expanded={isExpanded}
                  />
                </Box>
              );
            }
          }

          return null;
        })}
      </Box>

      {/* Live Todo checklist */}
      <TodoListView />

      {/* Animated Spinner during generation */}
      {isGenerating && (
        <SpinnerView
          verb={spinnerVerb}
          startTime={spinnerStartTime}
          tokens={tokensUsed}
          cost={totalCost}
        />
      )}

      {/* Permission Approval Modal if waiting */}
      {permissionPrompt && <PermissionModal data={permissionPrompt} />}

      {/* Input Box */}
      <InputBox
        onSubmit={handleUserInput}
        onInterrupt={handleInterrupt}
        onRewind={handleRewind}
        onCyclePermissionMode={cyclePermissionMode}
        onToggleExpand={() => setIsExpanded(prev => !prev)}
        isGenerating={isGenerating}
        history={inputHistory}
      />

      {/* Status Line */}
      <StatusLine
        permissionMode={permissionMode}
        tokensUsed={tokensUsed}
        maxContextTokens={200000}
      />
    </Box>
  );
};
