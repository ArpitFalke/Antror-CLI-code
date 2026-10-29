import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { TodoItem, TodoState } from '../tools/todo.js';

export const TodoListView: React.FC = () => {
  const [todos, setTodos] = useState<TodoItem[]>(() => TodoState.getInstance().getItems());

  useEffect(() => {
    const unsubscribe = TodoState.getInstance().subscribe((newItems) => {
      setTodos([...newItems]);
    });
    return unsubscribe;
  }, []);

  if (todos.length === 0) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="#FF6B35"
      paddingX={1}
      marginY={1}
    >
      <Box marginBottom={0}>
        <Text bold color="#FF6B35">
          Tasks ({todos.filter(t => t.status === 'completed').length}/{todos.length})
        </Text>
      </Box>
      {todos.map(todo => {
        let mark = '☐';
        let markColor = 'gray';
        let textColor = 'white';

        if (todo.status === 'completed') {
          mark = '☒';
          markColor = 'green';
          textColor = 'gray';
        } else if (todo.status === 'in_progress') {
          mark = '▶';
          markColor = 'yellow';
          textColor = 'yellow';
        }

        return (
          <Box key={todo.id} marginLeft={1}>
            <Text color={markColor} bold>{mark} </Text>
            <Text color={textColor}>{todo.title}</Text>
          </Box>
        );
      })}
    </Box>
  );
};
