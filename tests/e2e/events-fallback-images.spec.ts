import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Uses actual production card/detail components with disposable in-memory props.
// Navigation adapters in this harness do not exercise the production router.
test('six renderable category illustrations and stable mixed cards',async({page},info)=>{
  await page.goto('/');
  const series=page.locator('[data-art-series] img');
  await expect(series).toHaveCount(6);
  for(const image of await series.all()) {
    await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth===1280&&img.naturalHeight===800)).toBe(true);
    expect((await image.getAttribute('src'))?.endsWith('.webp')).toBe(true);
  }
  const cards=page.locator('[data-mixed-grid] [data-event-card]');
  await expect(cards).toHaveCount(6);
  await expect(cards.locator('img[data-event-image-source="real"]')).toHaveCount(2);
  await expect(cards.locator('img[data-event-image-source="fallback"]')).toHaveCount(4);
  await expect(cards.locator('[data-smart-image-fit="contain"]')).toHaveCount(2);
  await expect(cards.locator('time')).toHaveCount(6);
  await expect(cards.nth(1)).toContainText('Zrušené');
  const dimensions=await cards.locator('img').evaluateAll(images=>images.map(img=>({width:img.getBoundingClientRect().width,height:img.getBoundingClientRect().height})));
  for(const value of dimensions) expect(value.width/value.height).toBeCloseTo(1.6,1);
  const results=await new AxeBuilder({page}).analyze();
  expect(results.violations.filter(v=>['serious','critical'].includes(v.impact??''))).toEqual([]);
  await page.screenshot({path:`outputs/redesign4/${info.project.name}-series-grid.png`,fullPage:true});
  for(const width of [320,390,768,1280,1440]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});
test('current props switch photo, removal, type and failed photo without losing imageDisplay',async({page})=>{
  await page.goto('/');
  const image=page.locator('[data-live-image] img:not([aria-hidden="true"])');
  await expect(image).toHaveAttribute('src',/vystavy.webp/);
  await page.getByRole('button',{name:'Nahrať fotografiu',exact:true}).click();
  await expect(image).toHaveAttribute('data-event-image-source','real');
  await expect(image).toHaveAttribute('data-smart-image-fit','contain');
  await page.getByRole('button',{name:'Odstrániť fotografiu',exact:true}).click();
  await expect(image).toHaveAttribute('src',/vystavy.webp/);
  await page.getByRole('button',{name:'Zmeniť na tréning'}).click();
  await expect(image).toHaveAttribute('src',/treningy.webp/);
  const warnings:string[]=[];page.on('console',msg=>{if(msg.type()==='warning')warnings.push(msg.text());});
  await page.getByRole('button',{name:'Pokazená fotografia'}).click();
  await expect(image).toHaveAttribute('src',/treningy.webp/);
  await expect.poll(()=>warnings.some(value=>value.includes('Event photograph failed'))).toBe(true);
  await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  await page.getByRole('button',{name:'Nahrať fotografiu',exact:true}).click();
  await expect(image).toHaveAttribute('data-event-image-source','real');
});
test('detail fallback and own photo remain responsive and accessible',async({page},info)=>{
  for(const own of [false,true]) {
    await page.goto('/?view=detail'+(own?'&photo=1':''));
    const image=page.locator('[data-event-image] img:not([aria-hidden="true"])');
    await expect(image).toHaveAttribute('data-event-image-source',own?'real':'fallback');
    if(own) await expect(image).toHaveAttribute('data-smart-image-fit','contain');
    else await expect(image).toHaveAttribute('alt',/Ilustračný obrázok/);
    await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
    await expect(page.getByRole('heading',{level:1})).toContainText('Podujatie pre milovníkov psov');
    await page.screenshot({path:`outputs/redesign4/${info.project.name}-detail-${own?'real':'fallback'}.png`,fullPage:true});
    const results=await new AxeBuilder({page}).analyze();
    expect(results.violations.filter(v=>['serious','critical'].includes(v.impact??''))).toEqual([]);
    for(const width of [320,390,768,1280,1440]) {
      await page.setViewportSize({width,height:900});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
  }
});
