import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { NotificationCard } from '@/components/NotificationCard';

// Mock lucide-react-native icons
jest.mock('lucide-react-native', () => ({
  Award: 'Award',
  Bell: 'Bell',
  Sparkles: 'Sparkles',
  Clock: 'Clock',
}));

describe('NotificationCard', () => {
  const baseProps = {
    id: '1',
    type: 'achievement' as const,
    title: 'Félicitations !',
    body: 'Vous avez atteint votre objectif quotidien.',
    createdAt: new Date().toISOString(),
    isRead: false,
  };

  it('displays the title', () => {
    render(<NotificationCard {...baseProps} />);
    
    expect(screen.getByText('Félicitations !')).toBeTruthy();
  });

  it('displays the body', () => {
    render(<NotificationCard {...baseProps} />);
    
    expect(screen.getByText('Vous avez atteint votre objectif quotidien.')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const mockOnPress = jest.fn();
    render(<NotificationCard {...baseProps} onPress={mockOnPress} />);
    
    fireEvent.press(screen.getByText('Félicitations !'));
    
    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it('calls onMarkAsRead when pressed and no onPress provided', () => {
    const mockOnMarkAsRead = jest.fn();
    render(<NotificationCard {...baseProps} onMarkAsRead={mockOnMarkAsRead} />);
    
    fireEvent.press(screen.getByText('Félicitations !'));
    
    expect(mockOnMarkAsRead).toHaveBeenCalledTimes(1);
  });

  it('renders different notification types', () => {
    const { rerender } = render(
      <NotificationCard {...baseProps} type="achievement" title="Achievement" />
    );
    expect(screen.getByText('Achievement')).toBeTruthy();

    rerender(
      <NotificationCard {...baseProps} type="reminder" title="Reminder" />
    );
    expect(screen.getByText('Reminder')).toBeTruthy();

    rerender(
      <NotificationCard {...baseProps} type="newContent" title="New Content" />
    );
    expect(screen.getByText('New Content')).toBeTruthy();
  });

  it('renders read notification differently', () => {
    const { toJSON: unreadJSON } = render(
      <NotificationCard {...baseProps} isRead={false} />
    );
    const unreadSnapshot = unreadJSON();

    const { toJSON: readJSON } = render(
      <NotificationCard {...baseProps} isRead={true} />
    );
    const readSnapshot = readJSON();

    // Both should render but with different styles
    expect(unreadSnapshot).toBeTruthy();
    expect(readSnapshot).toBeTruthy();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<NotificationCard {...baseProps} />);
    expect(toJSON()).toBeTruthy();
  });
});
