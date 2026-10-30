import { tv, type VariantProps } from 'tailwind-variants';

export const button = tv({
	base: 'lift inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium whitespace-nowrap transition-colors duration-(--dur-fast) disabled:pointer-events-none disabled:opacity-50 md:min-h-9',
	variants: {
		variant: {
			primary: 'bg-accent text-[color:var(--base)] hover:bg-accent/80',
			secondary: 'bg-highlight-low text-text hover:bg-highlight-med',
			outline: 'border border-highlight-med text-text hover:bg-highlight-low',
			ghost: 'text-text hover:bg-highlight-med/60',
			danger: 'border border-danger/30 bg-danger/15 text-danger hover:bg-danger/25'
		},
		size: {
			md: '',
			icon: 'w-11 px-0 md:w-9'
		}
	},
	defaultVariants: { variant: 'secondary', size: 'md' }
});

export type ButtonVariants = VariantProps<typeof button>;
