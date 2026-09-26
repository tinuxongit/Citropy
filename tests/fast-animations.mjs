import { chromium } from "playwright";

export const animationRate = 10;

export async function setAnimationRate(page, playbackRate) {
  const session = await page.context().newCDPSession(page);
  await session.send("Animation.enable");
  await session.send("Animation.setPlaybackRate", { playbackRate });
}

const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await launch(...args);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...options) => {
    const context = await newContext(...options);
    const newPage = context.newPage.bind(context);
    context.newPage = async () => {
      const page = await newPage();
      await setAnimationRate(page, animationRate);
      return page;
    };
    return context;
  };
  return browser;
};
