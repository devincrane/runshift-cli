import * as readline from "node:readline";

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function confirm(question: string): Promise<boolean> {
  const answer = await ask(question);
  const normalized = answer.toLowerCase();
  return normalized === "y" || normalized === "yes";
}

export async function promptChoice(question: string): Promise<"y" | "a" | "n"> {
  const answer = await ask(question);
  const normalized = answer.toLowerCase();
  if (normalized === "a" || normalized === "add") return "a";
  if (normalized === "y" || normalized === "yes") return "y";
  return "n";
}

export async function promptFilePath(question: string): Promise<string> {
  return ask(question);
}
