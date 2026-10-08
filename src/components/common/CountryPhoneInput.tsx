import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from '@/data/countries';
import { Input } from '@/components/ui/input';

export interface CountryPhoneInputProps {
  value: string; // E.164 format or raw digits, e.g. "+919876543210" or "9876543210"
  onChange: (fullPhoneNumber: string, country: Country) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  id?: string;
}

// Find matching country from phone string
function findCountryFromPhone(phoneStr: string): { country: Country; digits: string } {
  if (!phoneStr) return { country: DEFAULT_COUNTRY, digits: '' };

  const clean = phoneStr.trim();
  if (clean.startsWith('+')) {
    // Sort countries by longest dial code first to match +1876 before +1, +971 before +9, etc.
    const sorted = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);
    for (const c of sorted) {
      if (clean.startsWith(c.dialCode)) {
        return {
          country: c,
          digits: clean.slice(c.dialCode.length).replace(/\D/g, ''),
        };
      }
    }
  }

  return {
    country: DEFAULT_COUNTRY,
    digits: clean.replace(/\D/g, ''),
  };
}

export const CountryPhoneInput: React.FC<CountryPhoneInputProps> = ({
  value,
  onChange,
  placeholder = 'Mobile number',
  disabled = false,
  className = '',
  autoFocus = false,
  id = 'phone-input',
}) => {
  const initial = useMemo(() => findCountryFromPhone(value), []);
  const [selectedCountry, setSelectedCountry] = useState<Country>(initial.country);
  const [localDigits, setLocalDigits] = useState<string>(initial.digits);
  const [openModal, setOpenModal] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  // Sync when external value changes
  useEffect(() => {
    if (!value) {
      setLocalDigits('');
      return;
    }
    const parsed = findCountryFromPhone(value);
    setSelectedCountry(parsed.country);
    setLocalDigits(parsed.digits);
  }, [value]);

  // Focus search input when modal opens
  useEffect(() => {
    if (openModal) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [openModal]);

  // Filter countries by search query
  const filteredCountries = useMemo(() => {
    if (!searchQuery.trim()) return COUNTRIES;
    const q = searchQuery.toLowerCase().trim().replace(/^\+/, '');
    return COUNTRIES.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.replace('+', '').includes(q) ||
        c.code.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const handleDigitsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numeric digits
    let cleaned = e.target.value.replace(/\D/g, '');

    // If user pasted a full number with country code (e.g. +91 9876543210)
    if (e.target.value.startsWith('+')) {
      const parsed = findCountryFromPhone(e.target.value);
      setSelectedCountry(parsed.country);
      cleaned = parsed.digits;
      setLocalDigits(cleaned);
      const full = `${parsed.country.dialCode}${cleaned}`;
      onChange(full, parsed.country);
      return;
    }

    setLocalDigits(cleaned);
    const full = cleaned ? `${selectedCountry.dialCode}${cleaned}` : '';
    onChange(full, selectedCountry);
  };

  const handleSelectCountry = (country: Country) => {
    setSelectedCountry(country);
    setOpenModal(false);
    setSearchQuery('');
    const full = localDigits ? `${country.dialCode}${localDigits}` : '';
    onChange(full, country);
    setTimeout(() => {
      phoneInputRef.current?.focus();
    }, 100);
  };

  return (
    <div className={`relative w-full ${className}`}>
      {/* WhatsApp Style Side-by-Side Input */}
      <div className="flex items-center gap-2 w-full">
        {/* Country Selector Button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpenModal(true)}
          className="flex items-center gap-1.5 h-12 px-3 rounded-xl border border-border bg-muted/40 hover:bg-muted/70 text-foreground transition-all shrink-0 select-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40 active:scale-95 disabled:opacity-50"
          title="Select Country"
          aria-label={`Select country, currently ${selectedCountry.name} ${selectedCountry.dialCode}`}
        >
          <span className="text-xl leading-none">{selectedCountry.flag}</span>
          <span className="text-sm font-bold text-foreground tracking-tight">
            {selectedCountry.dialCode}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-0.5 opacity-70" />
        </button>

        {/* Local Number Input */}
        <div className="relative flex-1">
          <Input
            ref={phoneInputRef}
            id={id}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            disabled={disabled}
            autoFocus={autoFocus}
            value={localDigits}
            onChange={handleDigitsChange}
            placeholder={placeholder}
            className="h-12 text-base font-medium text-foreground tracking-wide"
          />
        </div>
      </div>

      {/* WhatsApp Style Country Picker Modal */}
      {openModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="relative w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-border flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-foreground">Select your country</h3>
                <p className="text-xs text-muted-foreground">Choose your country code to receive OTP</p>
              </div>
              <button
                type="button"
                onClick={() => setOpenModal(false)}
                className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-3 border-b border-border bg-muted/20">
              <div className="relative flex items-center">
                <Search className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search country or dial code (+91, India...)"
                  className="w-full h-11 pl-9 pr-9 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Countries List */}
            <div className="flex-1 overflow-y-auto divide-y divide-border/40 max-h-[55vh]">
              {filteredCountries.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No country found matching &ldquo;{searchQuery}&rdquo;
                </div>
              ) : (
                filteredCountries.map(country => {
                  const isSelected = country.code === selectedCountry.code;
                  return (
                    <button
                      key={`${country.code}-${country.dialCode}`}
                      type="button"
                      onClick={() => handleSelectCountry(country)}
                      className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/60 ${
                        isSelected ? 'bg-primary/10' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-2xl leading-none shrink-0">{country.flag}</span>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary font-bold' : 'text-foreground'}`}>
                            {country.name}
                          </p>
                          <p className="text-xs text-muted-foreground">{country.code}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold text-muted-foreground">
                          {country.dialCode}
                        </span>
                        {isSelected && <Check className="w-4 h-4 text-primary" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CountryPhoneInput;
