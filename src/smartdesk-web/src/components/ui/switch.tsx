import * as React from 'react';

export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={`h-5 w-9 cursor-pointer appearance-none rounded-full bg-gray-300 checked:bg-blue-600 ${className || ''}`}
        {...props}
      />
    );
  }
);
Switch.displayName = 'Switch';

export { Switch };
