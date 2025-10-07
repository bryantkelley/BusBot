import fs from "node:fs";
import path from "node:path";

const inputFolder = "./metro/txt";
const outputFolder = "./metro/json";

try {
  if (!fs.existsSync(inputFolder)) {
    throw new Error("Input files not found!");
  }

  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder);
  }

  const isFile = (fileName: string) => {
    return fs.lstatSync(fileName).isFile();
  };

  const files = fs
    .readdirSync(inputFolder)
    .map((fileName) => path.join(inputFolder, fileName))
    .filter(isFile);

  files.forEach((fileName) => {
    try {
      const data = fs
        .readFileSync(fileName, "utf8")
        .split(/\r?\n|\r|\n/g)
        .map((line) => line.split(","));
      const keys = data[0];
      const outputData = [];

      for (let dataIndex = 1; dataIndex < data.length; dataIndex++) {
        if (data[dataIndex].length === keys.length) {
          let row: any = {};
          for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
            row[keys[keyIndex]] = data[dataIndex][keyIndex];
          }
          outputData.push(row);
        }
      }

      fs.writeFileSync(fileName.replaceAll("txt", "json"), JSON.stringify(outputData, null, 2));
    } catch (err) {
      console.error(err);
    }
  });
} catch (e) {
  console.error(e);
}
