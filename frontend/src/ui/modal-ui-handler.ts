import BattleScene from "../battle-scene";
import { TextStyle, addTextObject } from "./text";
import { Mode } from "./ui";
import UiHandler from "./ui-handler";
import { WindowVariant, addWindow } from "./ui-theme";
import { Button } from "#enums/buttons";

export interface ModalConfig {
  buttonActions: Function[];
}

export abstract class ModalUiHandler extends UiHandler {
  protected modalContainer: Phaser.GameObjects.Container;
  protected modalBg: Phaser.GameObjects.NineSlice;
  protected titleText: Phaser.GameObjects.Text;
  protected buttonContainers: Phaser.GameObjects.Container[];
  protected buttonBgs: Phaser.GameObjects.NineSlice[];
  protected buttonLabels: Phaser.GameObjects.Text[];

  constructor(scene: BattleScene, mode: Mode | null = null) {
    super(scene, mode);

    this.buttonContainers = [];
    this.buttonBgs = [];
    this.buttonLabels = [];
  }

  abstract getModalTitle(config?: ModalConfig): string;

  abstract getWidth(config?: ModalConfig): number;

  abstract getHeight(config?: ModalConfig): number;

  abstract getMargin(config?: ModalConfig): [number, number, number, number];

  abstract getButtonLabels(config?: ModalConfig): string[];

  getButtonTopMargin(): number {
    return 0;
  }

  setup() {
    const ui = this.getUi();

    this.modalContainer = this.scene.add.container(0, 0);

    this.modalContainer.setInteractive(new Phaser.Geom.Rectangle(0, 0, this.scene.game.canvas.width / 6, this.scene.game.canvas.height / 6), Phaser.Geom.Rectangle.Contains);

    this.modalBg = addWindow(this.scene, 0, 0, 0, 0);

    this.modalContainer.add(this.modalBg);

    this.titleText = addTextObject(this.scene, 0, 4, "", TextStyle.SETTINGS_LABEL);
    this.titleText.setOrigin(0.5, 0);

    this.modalContainer.add(this.titleText);

    ui.add(this.modalContainer);

    const buttonLabels = this.getButtonLabels();

    for (const label of buttonLabels) {
      this.addButton(label);
    }

    this.modalContainer.setVisible(false);
  }

  private addButton(label: string) {
    const buttonTopMargin = this.getButtonTopMargin();
    const buttonLabel = addTextObject(this.scene, 0, 8, label, TextStyle.TOOLTIP_CONTENT);
    buttonLabel.setOrigin(0.5, 0.5);

    const buttonBg = addWindow(this.scene, 0, 0, buttonLabel.getBounds().width + 8, 16, false, false, 0, 0, WindowVariant.THIN);
    buttonBg.setOrigin(0.5, 0);
    buttonBg.setInteractive(new Phaser.Geom.Rectangle(0, 0, buttonBg.width, buttonBg.height), Phaser.Geom.Rectangle.Contains);

    const buttonContainer = this.scene.add.container(0, buttonTopMargin);

    this.buttonLabels.push(buttonLabel);
    this.buttonBgs.push(buttonBg);
    this.buttonContainers.push(buttonContainer);

    buttonContainer.add(buttonBg);
    buttonContainer.add(buttonLabel);

    this.addInteractionHoverEffect(buttonBg);

    this.modalContainer.add(buttonContainer);
  }

  show(args: any[]): boolean {
    if (args.length >= 1 && "buttonActions" in args[0]) {
      super.show(args);
      if (args[0].hasOwnProperty("fadeOut") && typeof args[0].fadeOut === "function") {
        const [ marginTop, marginRight, marginBottom, marginLeft ] = this.getMargin();

        const overlay = this.scene.add.rectangle(( this.getWidth() + marginLeft + marginRight) / 2, (this.getHeight() + marginTop + marginBottom) / 2, this.scene.game.canvas.width / 6, this.scene.game.canvas.height / 6, 0);
        overlay.setOrigin(0.5, 0.5);
        overlay.setName("rect-ui-overlay-modal");
        overlay.setAlpha(0);

        this.modalContainer.add(overlay);
        this.modalContainer.moveTo(overlay, 0);

        this.scene.tweens.add({
          targets: overlay,
          alpha: 1,
          duration: 250,
          ease: "Sine.easeOut",
          onComplete: args[0].fadeOut
        });
      }

      const config = args[0] as ModalConfig;

      this.updateContainer(config);

      this.modalContainer.setVisible(true);

      this.getUi().moveTo(this.modalContainer, this.getUi().length - 1);

      for (let a = 0; a < this.buttonBgs.length; a++) {
        if (a < this.buttonBgs.length) {
          this.buttonBgs[a].on("pointerdown", (_) => config.buttonActions[a]());
        }
      }

      return true;
    }

    return false;
  }

  updateContainer(config?: ModalConfig): void {
    const [ marginTop, marginRight, marginBottom, marginLeft ] = this.getMargin(config);

    const [ width, height ] = [ this.getWidth(config), this.getHeight(config) ];
    this.modalContainer.setPosition((((this.scene.game.canvas.width / 6) - (width + (marginRight - marginLeft))) / 2), (((-this.scene.game.canvas.height / 6) - (height + (marginBottom - marginTop))) / 2));

    this.modalBg.setSize(width, height);

    const title = this.getModalTitle(config);

    this.titleText.setText(title);
    this.titleText.setX(width / 2);
    this.titleText.setVisible(!!title);

    for (let b = 0; b < this.buttonContainers.length; b++) {
      const sliceWidth = width / (this.buttonContainers.length + 1);

      this.buttonContainers[b].setPosition(sliceWidth * (b + 1), this.modalBg.height - (this.buttonBgs[b].height + 8));
    }
  }

  processInput(button: Button): boolean {
    return false;
  }

  clear() {
    super.clear();
    this.modalContainer.setVisible(false);

    this.buttonBgs.map(bg => bg.off("pointerdown"));
  }

  /**
   * Adds a hover effect to a game object which changes the cursor to a `pointer` and tints it slighly
   * @param gameObject the game object to add hover events/effects to
   */
  protected addInteractionHoverEffect(gameObject: Phaser.GameObjects.Image | Phaser.GameObjects.NineSlice | Phaser.GameObjects.Sprite) {
    gameObject.on("pointerover", () => {
      this.setMouseCursorStyle("pointer");
      gameObject.setTint(0xbbbbbb);
    });

    gameObject.on("pointerout", () => {
      this.setMouseCursorStyle("default");
      gameObject.clearTint();
    });
  }
}