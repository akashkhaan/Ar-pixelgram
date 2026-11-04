import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { InputHTMLAttributes, MouseEvent, PointerEvent } from "react";
import "./GlassSearch.css";

type GlassSearchProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  /** Start expanded (also true when autoFocus or a value is present). */
  defaultOpen?: boolean;
  wrapperClassName?: string;
};

/**
 * Expanding glass search bar (aurora ring + glass + clear button).
 * Drop-in replacement for a search <input>: all input props (value, onChange,
 * onKeyDown, ref, ...) are passed straight to the real input, so existing
 * search logic keeps working unchanged.
 */
const GlassSearch = forwardRef<HTMLInputElement, GlassSearchProps>(function GlassSearch(
  { defaultOpen, wrapperClassName, className, autoFocus, placeholder = "Search", ...inputProps },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
  const boxRef = useRef<HTMLDivElement>(null);
  const valueText = String(inputProps.value ?? inputProps.defaultValue ?? "");
  const [open, setOpen] = useState<boolean>(Boolean(defaultOpen || autoFocus || valueText));
  const [hasText, setHasText] = useState(valueText.length > 0);

  useEffect(() => {
    const v = String(inputProps.value ?? inputRef.current?.value ?? "");
    setHasText(v.length > 0);
    if (v) setOpen(true);
  }, [inputProps.value]);

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => inputRef.current?.focus(), 140);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  const openBar = useCallback(() => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 140);
  }, []);

  const clear = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = inputRef.current;
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    setHasText(false);
    el.focus();
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    box.style.setProperty("--mx", `${e.clientX - r.left}px`);
    box.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <div
      ref={boxRef}
      role="search"
      className={`glass-search${open ? " open" : ""}${hasText ? " has-text" : ""}${wrapperClassName ? ` ${wrapperClassName}` : ""}`}
      onClick={() => !open && openBar()}
      onPointerMove={onMove}
    >
      <span className="gs-aura" aria-hidden="true" />
      <span className="gs-glass" aria-hidden="true" />
      <span className="gs-ring" aria-hidden="true" />
      <button
        type="button"
        className="gs-icon"
        aria-label="Search"
        onClick={(e) => {
          e.stopPropagation();
          if (open) inputRef.current?.focus();
          else openBar();
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
      <input
        ref={inputRef}
        type="search"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        tabIndex={open ? 0 : -1}
        placeholder={placeholder}
        className={`gs-input${className ? ` ${className}` : ""}`}
        {...inputProps}
        onChange={(e) => {
          setHasText(e.target.value.length > 0);
          inputProps.onChange?.(e);
        }}
        onBlur={(e) => {
          inputProps.onBlur?.(e);
          if (!e.target.value && !defaultOpen && !autoFocus) setOpen(false);
        }}
      />
      <button
        type="button"
        className="gs-clear"
        aria-label="Clear search"
        tabIndex={hasText ? 0 : -1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={clear}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
    </div>
  );
});

export default GlassSearch;
