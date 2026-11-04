import { genericHookWords, HOOK_MAX_WORDS, hookWordCount } from '../lib/messages.js';
import { I, Icon } from './icons.jsx';

/** Word counter and the generic-praise warning for the hook field. Shown under the input. */
export default function HookHint({ value }) {
  const n = hookWordCount(value);
  const generic = genericHookWords(value);
  const over = n > HOOK_MAX_WORDS;
  return (
    <>
      <p className={`hint ${over ? 'hint-bad' : ''}`} role={over ? 'alert' : undefined}>
        <span className="num">{n}/{HOOK_MAX_WORDS}</span> words{over ? `. Shorten it to ${HOOK_MAX_WORDS} words or fewer before saving.` : '.'}
      </p>
      {generic.length > 0 && (
        <p className="inline-warn" role="note">
          <Icon as={I.Warning} />
          <span>
            {generic.map((w) => `“${w}”`).join(', ')} {generic.length > 1 ? 'are' : 'is'} generic praise and reads like a template. Use one true detail you actually saw, such as an item, a photo or a theme.
          </span>
        </p>
      )}
    </>
  );
}
