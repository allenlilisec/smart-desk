import * as React from 'react';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, onCheckedChange, onClick, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
      const newChecked = !e.currentTarget.checked;
      onCheckedChange?.(newChecked);
      onClick?.(e);
    };

    return (
      <input
        ref={ref}
        type="checkbox"
        className={`h-5 w-9 cursor-pointer appearance-none rounded-full bg-gray-300 checked:bg-blue-600 ${className || ''}`}
        onClick={handleClick}
        {...props}
      />
    );
  }
);
Switch.displayName = 'Switch';

export { Switch };
