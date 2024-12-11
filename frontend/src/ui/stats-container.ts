import BBCodeText from "phaser3-rex-plugins/plugins/gameobjects/tagtext/bbcodetext/BBCodeText";
import BattleScene from "../battle-scene";
import { TextStyle, addBBCodeTextObject, addTextObject, getTextColor } from "./text";
import { PERMANENT_STATS, getStatKey } from "#app/enums/stat";
import i18next from "i18next";


const ivChartSize = 24;
const ivChartStatCoordMultipliers = [[ 0, -1 ], [ 0.825, -0.5 ], [ 0.825, 0.5 ], [ -0.825, -0.5 ], [ -0.825, 0.5 ], [ 0, 1 ]];
const speedLabelOffset = -3;
const sideLabelOffset = 1;
const ivLabelOffset = [ 0, sideLabelOffset, -sideLabelOffset, sideLabelOffset, -sideLabelOffset, speedLabelOffset ];
const ivChartLabelyOffset = [ 0, 5, 0, 5, 0, 0 ]; // doing this so attack does not overlap with (+N)
const ivChartStatIndexes = [ 0, 1, 2, 5, 4, 3 ]; // swap special attack and speed

const defaultIvChartData = new Array(12).fill(null).map(() => 0);

export class StatsContainer extends Phaser.GameObjects.Container {
  private showDiff: boolean;
  private statsIvsCache: integer[];
  private ivChart: Phaser.GameObjects.Polygon;
  private ivStatValueTexts: BBCodeText[];

  constructor(scene: BattleScene, x: number, y: number, showDiff?: boolean) {
    super(scene, x, y);

    this.showDiff = !!showDiff;

    this.setup();
  }

  setup() {
    this.setName("stats");
    const ivChartBgData = new Array(6).fill(null).map((_, i: integer) => [ ivChartSize * ivChartStatCoordMultipliers[ivChartStatIndexes[i]][0], ivChartSize * ivChartStatCoordMultipliers[ivChartStatIndexes[i]][1] ] ).flat();
    const ivChartBg = this.scene.add.polygon(48, 44, ivChartBgData, 0xd8e0f0, 0.625);
    ivChartBg.setOrigin(0, 0);

    const ivChartBorder = this.scene.add.polygon(ivChartBg.x, ivChartBg.y, ivChartBgData)
      .setStrokeStyle(1, 0x484050);
    ivChartBorder.setOrigin(0, 0);

    const ivChartBgLines = [[ 0, -1, 0, 1 ], [ -0.825, -0.5, 0.825, 0.5 ], [ 0.825, -0.5, -0.825, 0.5 ]].map(coords => {
      const line = new Phaser.GameObjects.Line(this.scene, ivChartBg.x, ivChartBg.y, ivChartSize * coords[0], ivChartSize * coords[1], ivChartSize * coords[2], ivChartSize * coords[3], 0xffffff)
        .setLineWidth(0.5);
      line.setOrigin(0, 0);
      return line;
    });

    this.ivChart = this.scene.add.polygon(ivChartBg.x, ivChartBg.y, defaultIvChartData, 0x98d8a0, 0.75);
    this.ivChart.setOrigin(0, 0);

    this.add(ivChartBg);
    ivChartBgLines.map(l => this.add(l));
    this.add(this.ivChart);
    this.add(ivChartBorder);

    this.ivStatValueTexts = [];

    for (const s of PERMANENT_STATS) {
      const statLabel = addTextObject(
        this.scene,
        ivChartBg.x + (ivChartSize) * ivChartStatCoordMultipliers[s][0] * 1.325 + (this.showDiff ? 0 : ivLabelOffset[s]),
        ivChartBg.y + (ivChartSize) * ivChartStatCoordMultipliers[s][1] * 1.325 - 4 + (this.showDiff ? 0 : ivChartLabelyOffset[s]),
        i18next.t(getStatKey(s)),
        TextStyle.TOOLTIP_CONTENT
      );
      statLabel.setOrigin(0.5);

      this.ivStatValueTexts[s] = addBBCodeTextObject(this.scene, statLabel.x - (this.showDiff ? 0 : ivLabelOffset[s]), statLabel.y + 8, "0", TextStyle.TOOLTIP_CONTENT);
      this.ivStatValueTexts[s].setOrigin(0.5);


      this.add(statLabel);
      this.add(this.ivStatValueTexts[s]);
    }
  }

  updateIvs(ivs: integer[], originalIvs?: integer[]): void {
    if (ivs) {
      const ivChartData = new Array(6).fill(null).map((_, i) => [ (ivs[ivChartStatIndexes[i]] / 31) * ivChartSize * ivChartStatCoordMultipliers[ivChartStatIndexes[i]][0], (ivs[ivChartStatIndexes[i]] / 31) * ivChartSize * ivChartStatCoordMultipliers[ivChartStatIndexes[i]][1] ] ).flat();
      const lastIvChartData = this.statsIvsCache || defaultIvChartData;
      const perfectIVColor: string = getTextColor(TextStyle.SUMMARY_GOLD, false, (this.scene as BattleScene).uiTheme);
      this.statsIvsCache = ivChartData.slice(0);

      this.ivStatValueTexts.map((t: BBCodeText, i: integer) => {
        let label = "";

        // Check to see if IVs are 31, if so change the text style to gold, otherwise leave them be.
        if (ivs[i] === 31) {
          label += `[color=${perfectIVColor}][shadow]${ivs[i].toString()}[/shadow][/color]`;
        } else {
          label = ivs[i].toString();
        }
        if (this.showDiff && originalIvs) {
          if (originalIvs[i] < ivs[i]) {
            label += ` ([color=${getTextColor(TextStyle.SUMMARY_BLUE, false, (this.scene as BattleScene).uiTheme)}][shadow=${getTextColor(TextStyle.SUMMARY_BLUE, true, (this.scene as BattleScene).uiTheme)}]+${ivs[i] - originalIvs[i]}[/shadow][/color])`;
          } else {
            label += " (-)";
          }
        }
        t.setText(`[shadow]${label}[/shadow]`);
      });

      const newColor = ivs.every(iv => iv === 31) ? parseInt(perfectIVColor.substr(1), 16) : 0x98d8a0;
      const oldColor = this.ivChart.fillColor;
      const interpolateColor = oldColor !== newColor ? [
        Phaser.Display.Color.IntegerToColor(oldColor),
        Phaser.Display.Color.IntegerToColor(newColor)
      ] : null;

      this.scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 1000,
        ease: "Cubic.easeOut",
        onUpdate: (tween: Phaser.Tweens.Tween) => {
          const progress = tween.getValue();
          const interpolatedData = ivChartData.map((v: number, i: integer) => v * progress + (lastIvChartData[i] * (1 - progress)));
          if (interpolateColor) {
            this.ivChart.setFillStyle(
              Phaser.Display.Color.ValueToColor(
                Phaser.Display.Color.Interpolate.ColorWithColor(interpolateColor[0], interpolateColor[1], 1, progress)
              ).color,
              0.75);
          }
          this.ivChart.setTo(interpolatedData);
        }
      });
    } else {
      this.statsIvsCache = defaultIvChartData;
      this.ivChart.setTo(defaultIvChartData);
    }
  }
}