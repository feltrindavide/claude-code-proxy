import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderForm } from '@/components/ProviderForm';

vi.mock('@/lib/api', () => ({
  saveProvider: vi.fn().mockResolvedValue({ success: true }),
  testProviderConnection: vi.fn().mockResolvedValue({ valid: true }),
}));

vi.mock('@/components/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('ProviderForm', () => {
  it('shows validation error when name is empty', async () => {
    const user = userEvent.setup();
    render(
      <ProviderForm
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Save Provider' }));
    expect(screen.getByText('Provider name is required')).toBeInTheDocument();
  });

  it('auto-fills OpenRouter base URL for new providers', async () => {
    const user = userEvent.setup();
    render(
      <ProviderForm
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const [providerTypeSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(providerTypeSelect, 'OpenRouter');
    expect(screen.getByPlaceholderText('e.g., https://openrouter.ai/api')).toHaveValue(
      'https://openrouter.ai/api',
    );
  });
});
