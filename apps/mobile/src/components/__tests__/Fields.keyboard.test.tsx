import { fireEvent, render, screen } from '@testing-library/react-native';

import { MoneyField, TextField } from '../Fields';
import { KeyboardRevealContext } from '../useKeyboardInset';

describe('fields and the keyboard', () => {
  it('asks the screen to bring a focused field above the keyboard', async () => {
    const reveal = jest.fn();
    await render(
      <KeyboardRevealContext.Provider value={reveal}>
        <TextField label="Email" />
        <MoneyField label="Salary" valuePaise={null} onChangePaise={jest.fn()} />
      </KeyboardRevealContext.Provider>,
    );
    await fireEvent(screen.getByLabelText('Email'), 'focus');
    await fireEvent(screen.getByLabelText('Salary, in rupees'), 'focus');
    expect(reveal).toHaveBeenCalledTimes(2);
  });

  it("still runs a screen's own focus and blur handlers", async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    await render(<TextField label="Password" onFocus={onFocus} onBlur={onBlur} />);
    await fireEvent(screen.getByLabelText('Password'), 'focus');
    await fireEvent(screen.getByLabelText('Password'), 'blur');
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('works outside a scrolling screen (nothing to reveal)', async () => {
    await render(<TextField label="Name" />);
    await expect(fireEvent(screen.getByLabelText('Name'), 'focus')).resolves.not.toThrow();
  });
});
