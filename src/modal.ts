import { type App, Modal, Notice } from "obsidian";

interface IConfirmationDialogParams {
  cta: string;
  // biome-ignore lint/suspicious/noExplicitAny: generic callback signature
  onAccept: (...args: any[]) => Promise<void>;
  text: string;
  title: string;
}

class ConfirmationModal extends Modal {
  constructor(app: App, config: IConfirmationDialogParams) {
    super(app);

    const { cta, onAccept, text, title } = config;

    this.contentEl.createEl("h2", { text: title });
    this.contentEl.createEl("p", { text });

    this.contentEl.createDiv("modal-button-container", (buttonsEl) => {
      buttonsEl
        .createEl("button", { text: "Never mind" })
        .addEventListener("click", () => this.close());

      buttonsEl
        .createEl("button", {
          cls: "mod-cta",
          text: cta,
        })
        .addEventListener("click", async (e) => {
          try {
            await onAccept(e);
          } catch (err) {
            console.error("[Calendar] Confirmation action failed", err);
            new Notice("Something went wrong. Check the console for details.");
          } finally {
            this.close();
          }
        });
    });
  }
}

export function createConfirmationDialog({
  cta,
  onAccept,
  text,
  title,
}: IConfirmationDialogParams): void {
  new ConfirmationModal(window.app, { cta, onAccept, text, title }).open();
}
