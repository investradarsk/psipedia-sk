YªçŠx-®éÜj×¢ëiºÚ+Š§j[h‘éÜ¢éí×ÝôN‹Z–‹­¦ëeŠw¬Õ¥µÁ½ÉÐá•	Õ¥±‘•È™É½´€‰…á”µ½É”½Á±…åÝÉ¥¡Ðˆì)¥µÁ½ÉÐì•áÁ•Ð°Ñ•ÍÐô™É½´€‰Á±…åÝÉ¥¡Ð½Ñ•ÍÐˆì()½¹ÍÐ…Í•Ì€ôl(€ìÁ…Ñ è€ˆ½Á½µ½ŒµÁÍ½´½ÕÑÕ±­ä½”É”µ½É…¹¥é…¥„ˆ°Ñ¥Ñ±”è€‰ÉÁ½µ½»„½É…¹¥ë…¥„ˆ°™…ÑÌè€‰QåÀ½É…¹¥ë…¥”ˆô°(€ìÁ…Ñ è€ˆ½Á½µ½ŒµÁÍ½´½‘½…Í¹„µ½Á…Ñ•É„½”É”µ‘½…Í¹„µ½Á…Ñ•É„ˆ°Ñ¥Ñ±”è€‰5…àˆ³^÷ÒÚ$z{-®éÜj×(preflights).toBe(1);
  expect(applies).toBe(1);
  await expect(page.getByText("OznaÄenÃ©: 0", { exact: true })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
