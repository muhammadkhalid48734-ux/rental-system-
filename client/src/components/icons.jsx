// One icon set (Phosphor), one weight (regular), sizes from tokens. Icons are decorative: the control that holds
// an icon carries the accessible name, so every icon is hidden from the accessibility tree.
import {
  ArrowDown, ArrowUp, ArrowLeft, ArrowSquareOut, ArrowsClockwise, CaretDown, CaretLeft, CaretRight, Check, CheckCircle, ChatCircleText,
  CircleHalf, CopySimple, DotsThree, EnvelopeSimple, FacebookLogo, Gear, InstagramLogo, Keyboard, ListChecks,
  LockKey, MagnifyingGlass, Moon, PencilSimple, Plus, Sparkle, Sun, SignOut, Tray, UploadSimple, Users, Warning,
  WarningCircle, X, XCircle, Info, Trash, ClockCountdown, Eye, EyeSlash,
} from '@phosphor-icons/react';

export const ICON_SIZE = { sm: 16, md: 20, lg: 24, xl: 28 };

export function Icon({ as: Glyph, size = 'md', className = '' }) {
  return <Glyph className={`icon ${className}`.trim()} size={ICON_SIZE[size]} weight="regular" aria-hidden="true" focusable="false" />;
}

export const I = {
  ArrowDown, ArrowUp, ArrowLeft, ArrowSquareOut, ArrowsClockwise, CaretDown, CaretLeft, CaretRight, Check, CheckCircle, ChatCircleText,
  CircleHalf, CopySimple, DotsThree, EnvelopeSimple, FacebookLogo, Gear, InstagramLogo, Keyboard, ListChecks,
  LockKey, MagnifyingGlass, Moon, PencilSimple, Plus, Sparkle, Sun, SignOut, Tray, UploadSimple, Users, Warning,
  WarningCircle, X, XCircle, Info, Trash, ClockCountdown, Eye, EyeSlash,
};
