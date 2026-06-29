import "../../../../../__tests__/test-browser-apis";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { ArtifactFindExtension, getArtifactFindState } from "@/editor-core";
import type { TileKindId } from "@/stores/epics/canvas/tile-kinds";
import { createArtifactEditorFindAdapter } from "../artifact-editor-find-adapter";

const editors: Editor[] = [];

function makeEditor(content: string, editable: boolean): Editor {
  const editor = new Editor({
    extensions: [StarterKit, ArtifactFindExtension],
    content,
    editable,
  });
  editors.push(editor);
  return editor;
}

function makeAdapter(
  editor: Editor,
  tileKind: TileKindId,
  tileInstanceId: string,
) {
  return createArtifactEditorFindAdapter({
    editor,
    tileInstanceId,
    tileKind,
    activeUnitId: `${tileInstanceId}-artifact`,
  });
}

afterEach(() => {
  vi.useRealTimers();
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe("createArtifactEditorFindAdapter", () => {
  it("exposes find-only capabilities for read-only editors and replace for editable editors", () => {
    const readOnly = makeAdapter(
      makeEditor("<p>alpha</p>", false),
      "spec",
      "spec-readonly",
    );
    expect([...readOnly.getSnapshot().capabilities]).toEqual(["find"]);

    const editable = makeAdapter(
      makeEditor("<p>alpha</p>", true),
      "spec",
      "spec-editable",
    );
    expect([...editable.getSnapshot().capabilities]).toEqual([
      "find",
      "replace",
      "replaceAll",
    ]);
  });

  it.each(["spec", "ticket", "story", "review"] as const)(
    "uses the same artifact adapter path for %s tiles",
    (tileKind) => {
      const adapter = makeAdapter(
        makeEditor("<p>shared artifact body</p>", true),
        tileKind,
        `${tileKind}-tile`,
      );

      void adapter.search({
        requestId: 1,
        query: "artifact",
        matchCase: false,
      });

      const snapshot = adapter.getSnapshot();
      expect(adapter.tileKind).toBe(tileKind);
      expect(snapshot.total).toBe(1);
      expect(snapshot.activeUnitId).toBe(`${tileKind}-tile-artifact`);
      expect(snapshot.exactHighlight).toBe("painted");
    },
  );

  it("recomputes replace-current against the latest document before editing", () => {
    vi.useFakeTimers();
    const editor = makeEditor("<p>beta gamma beta</p>", true);
    const adapter = makeAdapter(editor, "spec", "stale-current");
    const unsubscribe = adapter.subscribe(() => undefined);
    void adapter.search({ requestId: 1, query: "beta", matchCase: false });
    const firstMatch = getArtifactFindState(editor).matches.at(0);
    if (firstMatch === undefined) {
      throw new Error("Expected an initial beta match.");
    }

    editor.view.dispatch(
      editor.state.tr.insertText("beto", firstMatch.from, firstMatch.to),
    );
    void adapter.replaceCurrent({
      requestId: 2,
      query: "beta",
      matchCase: false,
      replaceText: "XXX",
    });

    expect(editor.getText()).toBe("beto gamma XXX");
    unsubscribe();
  });

  it("dispatches replace-all as one undoable editor transaction", () => {
    const editor = makeEditor("<p>foo foo foo</p>", true);
    const adapter = makeAdapter(editor, "review", "replace-all");
    const docTransactions: Transaction[] = [];
    const handleTransaction = (props: {
      readonly transaction: Transaction;
    }) => {
      if (props.transaction.docChanged) docTransactions.push(props.transaction);
    };
    editor.on("transaction", handleTransaction);

    void adapter.replaceAll({
      requestId: 1,
      query: "foo",
      matchCase: false,
      replaceText: "bar",
    });

    expect(editor.getText()).toBe("bar bar bar");
    expect(docTransactions).toHaveLength(1);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe("foo foo foo");
    editor.off("transaction", handleTransaction);
  });
});
