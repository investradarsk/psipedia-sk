"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { $getRoot, type LexicalEditor } from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import styles from "./admin-lexical-draft-dialog.module.css";

/**
 * Safe opt-in copy drafting for the existing Markdown editor.
 * The original field remains authoritative; Lexical is never loaded
 * with existing Markdown or used to rewrite stored content.
 */
export function AdminLexicalDraftDialog({open,onOpenChange,onAppend}:{
  open:boolean;
  onOpenChange:(open:boolean)=>void;
  onAppend:(plainText:string)=>void;
}) {
  const [text,setText]=useState("");
  const [problem,setProblem]=useState("");
  const editorConfig={
    namespace:"PsipediaEventDraft",
    theme:{},
    onError:(error:Error,_editor:LexicalEditor)=>{setProblem("Editor zaznamenal chybu. Text nebol pridaný.");console.error(error);},
  };
  function append() {
    if(!text.trim()||problem)return;
    onAppend(text);
    onOpenChange(false);
  }
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content className={styles.content} aria-describedby="lexical-draft-help">
        <Dialog.Title className={styles.title}>Pripraviť nový text</Dialog.Title>
        <Dialog.Description id="lexical-draft-help" className={styles.description}>
          Napíš nový text. Pôvodný popis zostane nezmenený; po potvrdení sa nový text pridá na koniec. Zmeny potom ulož v editore podujatia.
        </Dialog.Description>
        <LexicalComposer initialConfig={editorConfig}>
          <div className={styles.editorWrap}>
            <PlainTextPlugin
              contentEditable={<ContentEditable aria-label="Nový text podujatia" className={styles.editor} />}
              placeholder={<p className={styles.placeholder}>Začni písať…</p>}
              ErrorBoundary={LexicalErrorBoundary}
            />
            <HistoryPlugin />
            <OnChangePlugin onChange={state=>state.read(()=>setText($getRoot().getTextContent()))} />
          </div>
        </LexicalComposer>
        {problem && <p role="alert">{problem}</p>}
        <div className={styles.actions}>
          <Dialog.Close type="button">Zrušiť</Dialog.Close>
          <button type="button" disabled={!text.trim()||Boolean(problem)} onClick={append}>Pridať do popisu</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
