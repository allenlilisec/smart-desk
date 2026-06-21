import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const variantStyles = {
  default: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
  outline: 'border border-gray-300 bg-transparent hover:bg-gray-100',
  ghost: 'hover:bg-gray-100',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
  link: 'text-blue-600 underline-offset-4 hover:underline',
};

const sizeStyles = {
  default: 'px-4 py-2',
  sm: 'px-2 py-1 text-sm',
  lg: 'px-6 py-3 text-lg',
  icon: 'p-2',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variantClass = variantStyles[variant] || variantStyles.default;
    const sizeClass = sizeStyles[size] || sizeStyles.default;

    return (
      <button
        ref={ref}
        className={`rounded font-medium transition-colors disabled:opacity-50 ${variantClass} ${sizeClass} ${className || ''}`}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button };
