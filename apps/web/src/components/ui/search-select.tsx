import * as React from 'react';
import { Check, ChevronDown, X, Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchSelectOption<T = unknown> {
  value: string;
  label: string;
  description?: string;
  data?: T;
}

export interface SearchSelectProps<T = unknown> {
  /** Current selected value */
  value: string;
  /** Callback when value changes */
  onChange: (value: string, option?: SearchSelectOption<T>) => void;
  /** Options to display - can be static or dynamic from search */
  options: SearchSelectOption<T>[];
  /** Placeholder text when no value is selected */
  placeholder?: string;
  /** Label for the select */
  label?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Error message to display */
  error?: string;
  /** Whether the select is disabled */
  disabled?: boolean;
  /** Whether the select is in loading state */
  loading?: boolean;
  /** Whether the select is clearable */
  clearable?: boolean;
  /** Callback for search input changes (for async search) */
  onSearch?: (query: string) => void;
  /** Minimum characters before search is triggered */
  minSearchLength?: number;
  /** Debounce delay for search in ms */
  searchDebounceMs?: number;
  /** Whether to enable local filtering (for static options) */
  enableLocalFilter?: boolean;
  /** Custom filter function */
  filterFn?: (option: SearchSelectOption<T>, query: string) => boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Custom class name */
  className?: string;
  /** Display selected value in input (defaults to label) */
  displayValue?: (option: SearchSelectOption<T>) => string;
  /** Render custom option */
  renderOption?: (option: SearchSelectOption<T>, isHighlighted: boolean, isSelected: boolean) => React.ReactNode;
  /** Auto focus on mount */
  autoFocus?: boolean;
}

function highlightText(text: string, searchTerm: string): React.ReactNode {
  if (!searchTerm) return text;
  const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, index) =>
    regex.test(part) ? (
      <span key={index} className="bg-yellow-200 font-medium">
        {part}
      </span>
    ) : (
      part
    )
  );
}

export function SearchSelect<T = unknown>({
  value,
  onChange,
  options,
  placeholder = 'เลือก...',
  label,
  required = false,
  error,
  disabled = false,
  loading = false,
  clearable = true,
  onSearch,
  minSearchLength = 0,
  searchDebounceMs = 300,
  enableLocalFilter = true,
  filterFn,
  emptyMessage = 'ไม่พบข้อมูล',
  className,
  displayValue,
  renderOption,
  autoFocus = false,
}: SearchSelectProps<T>) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const searchTimeoutRef = React.useRef<number | null>(null);

  // Find selected option
  const selectedOption = React.useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  // Filter options based on search
  const filteredOptions = React.useMemo(() => {
    if (!enableLocalFilter || !searchQuery) return options;
    
    const defaultFilter = (opt: SearchSelectOption<T>, query: string) => {
      const searchLower = query.toLowerCase();
      return (
        opt.label.toLowerCase().includes(searchLower) ||
        (opt.description?.toLowerCase().includes(searchLower) ?? false)
      );
    };
    
    const filter = filterFn || defaultFilter;
    return options.filter((opt) => filter(opt, searchQuery));
  }, [options, searchQuery, enableLocalFilter, filterFn]);

  // Handle click outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle search with debounce
  React.useEffect(() => {
    if (onSearch && searchQuery.length >= minSearchLength) {
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = window.setTimeout(() => {
        onSearch(searchQuery);
      }, searchDebounceMs);
    }
    return () => {
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, onSearch, minSearchLength, searchDebounceMs]);

  // Scroll highlighted item into view
  React.useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  // Auto focus
  React.useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    setHighlightedIndex(0);
    if (!isOpen) setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => 
          Math.min(prev + 1, filteredOptions.length - 1)
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          handleSelect(filteredOptions[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(-1);
        break;
      case 'Tab':
        setIsOpen(false);
        setSearchQuery('');
        break;
    }
  };

  const handleSelect = (option: SearchSelectOption<T>) => {
    onChange(option.value, option);
    setIsOpen(false);
    setSearchQuery('');
    setHighlightedIndex(-1);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('', undefined);
    setSearchQuery('');
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    setIsOpen(true);
    setHighlightedIndex(filteredOptions.findIndex((opt) => opt.value === value));
  };

  const getDisplayText = () => {
    if (searchQuery) return searchQuery;
    if (selectedOption) {
      return displayValue ? displayValue(selectedOption) : selectedOption.label;
    }
    return '';
  };

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div ref={containerRef} className="relative">
        <div
          className={cn(
            'relative flex items-center w-full rounded-lg border bg-white transition-colors',
            error ? 'border-red-500' : 'border-gray-300',
            disabled ? 'bg-gray-100 cursor-not-allowed' : 'hover:border-gray-400',
            isOpen && !error && 'ring-2 ring-blue-500 border-transparent'
          )}
        >
          <Search className="absolute left-3 h-4 w-4 text-gray-400 pointer-events-none" />
          
          <input
            ref={inputRef}
            type="text"
            value={getDisplayText()}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              'w-full pl-10 pr-16 py-2 bg-transparent outline-none text-gray-900',
              'placeholder:text-gray-400',
              disabled && 'cursor-not-allowed'
            )}
          />
          
          <div className="absolute right-2 flex items-center gap-1">
            {loading && (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            )}
            
            {clearable && value && !disabled && !loading && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
              </button>
            )}
            
            <ChevronDown
              className={cn(
                'h-4 w-4 text-gray-400 transition-transform',
                isOpen && 'rotate-180'
              )}
            />
          </div>
        </div>

        {/* Dropdown */}
        {isOpen && (
          <div
            ref={listRef}
            className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto"
          >
            {loading && filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                กำลังค้นหา...
              </div>
            ) : filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => {
                const isHighlighted = index === highlightedIndex;
                const isSelected = option.value === value;

                if (renderOption) {
                  return (
                    <div
                      key={option.value}
                      onClick={() => handleSelect(option)}
                      className="cursor-pointer"
                    >
                      {renderOption(option, isHighlighted, isSelected)}
                    </div>
                  );
                }

                return (
                  <div
                    key={option.value}
                    onClick={() => handleSelect(option)}
                    className={cn(
                      'px-3 py-2 cursor-pointer flex items-center justify-between',
                      'border-b border-gray-100 last:border-b-0',
                      isHighlighted && 'bg-blue-50',
                      isSelected && 'bg-blue-100',
                      !isHighlighted && !isSelected && 'hover:bg-gray-50'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-900 truncate">
                        {highlightText(option.label, searchQuery)}
                      </div>
                      {option.description && (
                        <div className="text-sm text-gray-500 truncate">
                          {highlightText(option.description, searchQuery)}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="h-4 w-4 text-blue-600 ml-2 shrink-0" />
                    )}
                  </div>
                );
              })
            ) : (
              <div className="px-3 py-4 text-center text-gray-500">
                {emptyMessage}
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-1 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}

// Async variant with built-in debounced search
export interface AsyncSearchSelectProps<T = unknown> extends Omit<SearchSelectProps<T>, 'options' | 'onSearch'> {
  /** Async function to fetch options */
  loadOptions: (query: string) => Promise<SearchSelectOption<T>[]>;
  /** Initial options to show before search */
  defaultOptions?: SearchSelectOption<T>[];
  /** Cache loaded options */
  cacheOptions?: boolean;
}

export function AsyncSearchSelect<T = unknown>({
  loadOptions,
  defaultOptions = [],
  cacheOptions = true,
  minSearchLength = 2,
  searchDebounceMs = 300,
  ...props
}: AsyncSearchSelectProps<T>) {
  const [options, setOptions] = React.useState<SearchSelectOption<T>[]>(defaultOptions);
  const [loading, setLoading] = React.useState(false);
  const [cache, setCache] = React.useState<Map<string, SearchSelectOption<T>[]>>(new Map());

  const handleSearch = React.useCallback(async (query: string) => {
    if (query.length < minSearchLength) {
      setOptions(defaultOptions);
      return;
    }

    if (cacheOptions && cache.has(query)) {
      setOptions(cache.get(query) || []);
      return;
    }

    try {
      setLoading(true);
      const results = await loadOptions(query);
      setOptions(results);
      
      if (cacheOptions) {
        setCache((prev) => new Map(prev).set(query, results));
      }
    } catch (error) {
      console.error('Error loading options:', error);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [loadOptions, minSearchLength, defaultOptions, cacheOptions, cache]);

  return (
    <SearchSelect
      {...props}
      options={options}
      loading={loading}
      onSearch={handleSearch}
      minSearchLength={minSearchLength}
      searchDebounceMs={searchDebounceMs}
      enableLocalFilter={false}
    />
  );
}

export default SearchSelect;
