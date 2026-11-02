import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginView } from '../../src/components/LoginView';

const authMocks = vi.hoisted(() => ({
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  sendPasswordReset: vi.fn(),
  signInAsGuest: vi.fn(),
  logOut: vi.fn(),
  formatAuthError: vi.fn(() => 'Unable to authenticate.'),
}));

vi.mock('../../src/firebase', () => authMocks);

describe('LoginView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits email and password for sign-in', async () => {
    const user = userEvent.setup();
    authMocks.signInWithEmail.mockResolvedValue(undefined);
    render(<LoginView currentUser={null} />);

    await user.type(screen.getByPlaceholderText('engineer@company.com'), 'dev@example.com');
    await user.type(screen.getByPlaceholderText('••••••••••••'), 'Secure-pass1');
    await user.click(screen.getByRole('button', { name: 'Sign In to CodeSentry' }));

    await waitFor(() => {
      expect(authMocks.signInWithEmail).toHaveBeenCalledWith('dev@example.com', 'Secure-pass1');
    });
    expect(await screen.findByText('Signed in successfully.')).toBeInTheDocument();
  });

  it('shows a loading state while sign-in is pending', async () => {
    const user = userEvent.setup();
    let finishSignIn!: () => void;
    authMocks.signInWithEmail.mockReturnValue(new Promise<void>((resolve) => {
      finishSignIn = resolve;
    }));
    render(<LoginView currentUser={null} />);

    await user.type(screen.getByPlaceholderText('engineer@company.com'), 'dev@example.com');
    await user.type(screen.getByPlaceholderText('••••••••••••'), 'Secure-pass1');
    const submitButton = screen.getByRole('button', { name: 'Sign In to CodeSentry' });
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();
    finishSignIn();
  });

  it('shows an authentication error from Firebase', async () => {
    const user = userEvent.setup();
    authMocks.signInWithEmail.mockRejectedValue(new Error('Firebase failure'));
    render(<LoginView currentUser={null} />);

    await user.type(screen.getByPlaceholderText('engineer@company.com'), 'dev@example.com');
    await user.type(screen.getByPlaceholderText('••••••••••••'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign In to CodeSentry' }));

    expect(await screen.findByText('Unable to authenticate.')).toBeInTheDocument();
    expect(authMocks.formatAuthError).toHaveBeenCalled();
  });

  it('registers a new account with the entered profile details', async () => {
    const user = userEvent.setup();
    authMocks.signUpWithEmail.mockResolvedValue(undefined);
    render(<LoginView currentUser={null} />);

    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    await user.type(screen.getByPlaceholderText('e.g. Alex Vance'), 'Alex Vance');
    await user.type(screen.getByPlaceholderText('engineer@company.com'), 'alex@example.com');
    const passwordInputs = screen.getAllByPlaceholderText('••••••••••••');
    await user.type(passwordInputs[0], 'Secure-pass1');
    await user.type(passwordInputs[1], 'Secure-pass1');
    await user.click(screen.getByRole('button', { name: 'Create Security Account' }));

    await waitFor(() => {
      expect(authMocks.signUpWithEmail).toHaveBeenCalledWith(
        'alex@example.com',
        'Secure-pass1',
        'Alex Vance',
      );
    });
    expect(await screen.findByText('Account created successfully! Welcome to CodeSentry AI.')).toBeInTheDocument();
  });

  it('rejects mismatched registration passwords before calling Firebase', async () => {
    const user = userEvent.setup();
    render(<LoginView currentUser={null} />);

    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    await user.type(screen.getByPlaceholderText('engineer@company.com'), 'alex@example.com');
    const passwordInputs = screen.getAllByPlaceholderText('••••••••••••');
    await user.type(passwordInputs[0], 'Secure-pass1');
    await user.type(passwordInputs[1], 'Different-pass1');
    await user.click(screen.getByRole('button', { name: 'Create Security Account' }));

    expect(await screen.findByText(/Passwords do not match/)).toBeInTheDocument();
    expect(authMocks.signUpWithEmail).not.toHaveBeenCalled();
  });
});
