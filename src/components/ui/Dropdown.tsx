import { useState, useEffect, useRef, useMemo, useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import Input from './Input';
import Text from './Text';
import { TEXT_COLOR_KEYS, TextColors, TextVariants, TextWeights } from '../../types/typography';
import clsx from 'clsx';

export interface OptionItem<T extends React.Key> {
  label: string;
  value: T;
}

interface DropdownProps<T extends React.Key> {
  className?: string;
  onChange: (value: T) => void;
  options: Array<OptionItem<T>>;
  placeholder?: string;
  searchPlaceholder?: string;
  value: T | null;
  disabled?: boolean;
  triggerClassName?: string;
}

const Dropdown = <T extends React.Key>({
  className = '',
  onChange,
  options,
  placeholder = 'Select an option',
  searchPlaceholder = 'Filter options...',
  value,
  disabled = false,
  triggerClassName = '',
}: DropdownProps<T>) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const listboxId = useId();
  const selectedOption = options.find((opt) => opt.value === value) || null;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      setShowSearch(false);
      setFocusedIndex(-1);
    }
  }, [isOpen]);

  const handleSelect = (option: OptionItem<T>) => {
    onChange(option.value);
    setIsOpen(false);
  };

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    return options.filter((opt) => opt.label.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [options, searchTerm]);

  const isPrintableKey = (e: React.KeyboardEvent<Element>): boolean => {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    return e.key.length === 1;
  };

  const handleContainerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setIsOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setFocusedIndex(0);
      } else if (filteredOptions.length > 0) {
        setFocusedIndex((prev) => (prev + 1) % filteredOptions.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isOpen && filteredOptions.length > 0) {
        setFocusedIndex((prev) => (prev <= 0 ? filteredOptions.length - 1 : prev - 1));
      }
      return;
    }

    if (e.key === 'Enter') {
      if (isOpen && focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
        e.stopPropagation();
        e.preventDefault();
        handleSelect(filteredOptions[focusedIndex]);
      } else if (isOpen && filteredOptions.length === 1) {
        e.stopPropagation();
        e.preventDefault();
        handleSelect(filteredOptions[0]);
      }
      return;
    }

    if (e.target === searchInputRef.current) return;

    if (isPrintableKey(e)) {
      e.stopPropagation();
      e.preventDefault();

      setIsOpen(true);
      setShowSearch(true);
      setSearchTerm((prev) => prev + e.key);
    }
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef} onKeyDown={handleContainerKeyDown}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? listboxId : undefined}
        disabled={disabled}
        className={clsx(
          'w-full border border-border-color rounded-md px-3 mr-4 py-2 flex justify-between items-center text-left disabled:opacity-50 disabled:cursor-not-allowed',
          'focus:ring-accent focus:border-accent focus:outline-hidden focus:ring-2',
          triggerClassName || 'bg-surface',
        )}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <Text as="span" variant={TextVariants.label} color={TextColors.primary}>
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
        <ChevronDown
          className={`${TEXT_COLOR_KEYS[TextColors.secondary]} transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          size={20}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="absolute right-0 mt-2 w-full origin-top-right z-20"
            exit={{ opacity: 0, scale: 0.95 }}
            initial={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1, ease: 'easeOut' }}
          >
            <div
              id={listboxId}
              aria-orientation="vertical"
              aria-activedescendant={focusedIndex >= 0 ? `${listboxId}-option-${focusedIndex}` : undefined}
              className="bg-surface/95 backdrop-blur-md rounded-lg shadow-xl p-2 max-h-80 overflow-y-auto"
              role="listbox"
            >
              {showSearch && (
                <Input
                  ref={searchInputRef}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={searchPlaceholder}
                  autoFocus={true}
                  className="mb-2"
                />
              )}

              {filteredOptions.map((option: OptionItem<T>, index: number) => {
                const isSelected = value === option.value;
                const isFocused = index === focusedIndex;
                return (
                  <button
                    key={option.value}
                    id={`${listboxId}-option-${index}`}
                    onClick={() => handleSelect(option)}
                    className={clsx(
                      'w-full text-left px-3 py-2 rounded-md flex items-center justify-between',
                      'transition-colors duration-150 hover:bg-bg-primary',
                      {
                        'bg-bg-primary': isSelected,
                        'ring-1 ring-inset ring-accent': isFocused,
                      },
                    )}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <Text color={TextColors.primary} weight={isSelected ? TextWeights.semibold : TextWeights.normal}>
                      {option.label}
                    </Text>
                    {isSelected && <Check size={16} className={TEXT_COLOR_KEYS[TextColors.primary]} />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dropdown;
