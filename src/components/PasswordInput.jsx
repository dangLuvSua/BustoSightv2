import { forwardRef, useState } from "react";

// `type` is swallowed so it can never override the reveal toggle, and the ref is
// forwarded to the underlying input so callers can still focus it.
const PasswordInput = forwardRef(function PasswordInput(
  { className = "", style, type: _ignoredType, ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="pw-field">
      <input
        ref={ref}
        type={visible ? "text" : "password"}
        className={className}
        style={style}
        {...rest}
      />
      <button
        type="button"
        className={`pw-toggle${visible ? " is-visible" : ""}`}
        onClick={() => setVisible((prev) => !prev)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
      >
        <i
          className={`fa-solid ${visible ? "fa-eye-slash" : "fa-eye"}`}
          aria-hidden="true"
        />
      </button>
    </div>
  );
});

export default PasswordInput;