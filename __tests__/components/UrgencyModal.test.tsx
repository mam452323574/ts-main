import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { UrgencyModal } from '../../components/UrgencyModal';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';

jest.mock('../../contexts/ThemeContext', () => ({
    useTheme: jest.fn(),
}));
jest.mock('../../contexts/LanguageContext', () => ({
    useLanguage: jest.fn(),
}));
jest.mock('lucide-react-native', () => {
    const { Text } = require('react-native');
    return {
        AlertTriangle: () => <Text>AlertTriangleIcon</Text>,
    };
});

describe('UrgencyModal', () => {
    const mockT = jest.fn(key => key);

    beforeEach(() => {
        jest.clearAllMocks();

        (useLanguage as jest.Mock).mockReturnValue({
            t: mockT,
        });

        (useTheme as jest.Mock).mockReturnValue({
            colors: {
                cardBackground: '#FFFFFF',
                warning: '#FF9500',
                primaryText: '#000000',
                gray: '#808080',
                white: '#FFFFFF',
            },
        });
    });

    it('renders when visible is true', () => {
        const { getByText } = render(
            <UrgencyModal visible={true} onDismiss={jest.fn()} />
        );

        expect(getByText('AlertTriangleIcon')).toBeTruthy();
        expect(getByText('components.urgency.title')).toBeTruthy();
        expect(getByText('components.urgency.message')).toBeTruthy();
        expect(getByText('components.urgency.dismiss')).toBeTruthy();
    });

    it('does not render content when visible is false', () => {
        // Modal from react-native might still render its root container but not visible. 
        // We can check if the modal is hidden. Usually, children are not rendered or they are in a hidden modal.
        // In @testing-library/react-native, Modal children might still be parsed unless we check `visible` prop of Modal.
        const { getByTestId, UNSAFE_getByType } = render(
            <UrgencyModal visible={false} onDismiss={jest.fn()} />
        );

        const modal = UNSAFE_getByType(require('react-native').Modal);
        expect(modal.props.visible).toBe(false);
    });

    it('calls onDismiss when dismiss button is pressed', () => {
        const mockOnDismiss = jest.fn();
        const { getByText } = render(
            <UrgencyModal visible={true} onDismiss={mockOnDismiss} />
        );

        fireEvent.press(getByText('components.urgency.dismiss'));
        expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });
});
