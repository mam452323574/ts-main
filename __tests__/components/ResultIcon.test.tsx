import React from 'react';
import { render } from '@testing-library/react-native';
import { ResultIcon } from '@/components/ResultIcon';

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Circle: 'Circle',
  Line: 'Line',
  Path: 'Path',
}));

jest.mock('lucide-react-native', () => {
  const ReactLocal = require('react');
  const { Text: RNText } = require('react-native');
  const makeIcon = (label: string) => (props: any) =>
    ReactLocal.createElement(RNText, props, label);

  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === '__esModule') {
          return true;
        }

        return makeIcon(String(prop));
      },
    },
  );
});

describe('ResultIcon', () => {
  it('renders lucide-backed icons from the centralized catalog', () => {
    const { getByText } = render(<ResultIcon color="#111111" token="glow" />);

    expect(getByText('SunMedium')).toBeTruthy();
  });

  it('passes an explicit stroke width to lucide-backed icons when requested', () => {
    const { getByText } = render(
      <ResultIcon color="#111111" strokeWidth={2.2} token="glow" />
    );

    expect(getByText('SunMedium').props.strokeWidth).toBe(2.2);
  });

  it('renders custom svg icons for specialized result concepts', () => {
    const { getByTestId } = render(
      <ResultIcon
        color="#111111"
        testID="face-shape-icon"
        token="face_shape"
      />,
    );

    expect(getByTestId('face-shape-icon')).toBeTruthy();
  });
});
