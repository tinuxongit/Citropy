import { useEffect, useImperativeHandle, useRef, type AriaAttributes, type Ref, type RefObject } from "react";
import {
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  PASTE_COMMAND,
  SKIP_DOM_SELECTION_TAG,
  TextNode,
  mergeRegister,
} from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { MentionLooks, MentionNode, type MentionLook } from "./mention-node.tsx";
import { $chipMentions, $markMessageDirty, $messageCaret, $messageText, $setMessage, $unchipMention } from "./message-text.ts";

const KEY_COMMANDS = [KEY_ARROW_DOWN_COMMAND, KEY_ARROW_UP_COMMAND, KEY_ESCAPE_COMMAND, KEY_TAB_COMMAND];

export type MessageEditorHandle = { setMessage: (text: string, caret: number) => void };

type Behavior = {
  value: string;
  onChange: (value: string) => void;
  onCaret: (caret: number) => void;
  onKey: (event: KeyboardEvent) => boolean;
  pastedFiles: (data: DataTransfer) => File[];
  onFiles: (files: File[]) => void;
  disabled: boolean;
  mentions: ReadonlyMap<string, MentionLook>;
  handle: Ref<MessageEditorHandle>;
};

function MessageBehavior(props: Behavior) {
  const [editor] = useLexicalComposerContext();
  const latest = useRef(props);
  latest.current = props;
  const emitted = useRef(props.value);
  const mentionNames = [...props.mentions.keys()].join("\n");

  useImperativeHandle(props.handle, () => ({
    setMessage: (text, caret) => {
      editor.focus();
      editor.update(() => $setMessage(text, caret));
    },
  }), [editor]);

  useEffect(() => {
    const known = (name: string) => latest.current.mentions.has(name);
    const handleKey = (event: KeyboardEvent | null) => {
      if (!event || event.isComposing || !latest.current.onKey(event)) return false;
      event.preventDefault();
      return true;
    };
    return mergeRegister(
      editor.registerNodeTransform(TextNode, (node) => $chipMentions(node, known)),
      editor.registerNodeTransform(MentionNode, (node) => $unchipMention(node, known)),
      editor.registerUpdateListener(({ editorState }) => editorState.read(() => {
        const text = $messageText();
        latest.current.onCaret($messageCaret());
        if (text === emitted.current) return;
        emitted.current = text;
        latest.current.onChange(text);
      })),
      editor.registerCommand(PASTE_COMMAND, (event) => {
        if (!(event instanceof ClipboardEvent) || !event.clipboardData) return false;
        const files = latest.current.pastedFiles(event.clipboardData);
        if (!files.length) return false;
        event.preventDefault();
        latest.current.onFiles(files);
        return true;
      }, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_ENTER_COMMAND, handleKey, COMMAND_PRIORITY_HIGH),
      ...KEY_COMMANDS.map((command) => editor.registerCommand(command, handleKey, COMMAND_PRIORITY_HIGH)),
    );
  }, [editor]);

  useEffect(() => {
    editor.update($markMessageDirty);
  }, [editor, mentionNames]);

  useEffect(() => {
    if (props.value === emitted.current) return;
    emitted.current = props.value;
    const focused = editor.getRootElement() === document.activeElement;
    editor.update(() => $setMessage(props.value, focused ? props.value.length : undefined), focused ? {} : { tag: SKIP_DOM_SELECTION_TAG });
  }, [editor, props.value]);

  useEffect(() => {
    editor.setEditable(!props.disabled);
  }, [editor, props.disabled]);

  return null;
}

export function MessageEditor({
  box,
  placeholder,
  ...props
}: Behavior & {
  box: RefObject<HTMLDivElement | null>;
  placeholder: string;
  "aria-controls"?: AriaAttributes["aria-controls"];
  "aria-activedescendant"?: AriaAttributes["aria-activedescendant"];
}) {
  const { "aria-controls": controls, "aria-activedescendant": active, ...behavior } = props;
  return (
    <LexicalComposer
      initialConfig={{
        namespace: "message",
        nodes: [MentionNode],
        editable: !props.disabled,
        editorState: () => $setMessage(props.value),
        onError: (error) => { throw error; },
      }}
    >
      <MentionLooks value={props.mentions}>
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              ref={box}
              className="composer-input scroll"
              aria-label="Message"
              aria-multiline
              aria-autocomplete="list"
              aria-controls={controls}
              aria-activedescendant={active}
              spellCheck={false}
              placeholder={<div className="composer-placeholder">{placeholder}</div>}
              aria-placeholder={placeholder}
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </MentionLooks>
      <HistoryPlugin />
      <MessageBehavior {...behavior} />
    </LexicalComposer>
  );
}
