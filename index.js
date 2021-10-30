const { chromium } = require('playwright')
const fs = require('fs')
const products = []

;(async () => {
  console.log('Starting scraping')
  const browser = await chromium.launch()
  // Create pages, interact with UI elements, assert values
  const page = await browser.newPage()
  await page.goto('https://webscraper.io/test-sites/e-commerce/allinone')
  category_links = await page.$$eval('.category-link', (categories) =>
    categories.map((category) => category.href),
  )
  for (const category_link of category_links) {
    await extractInfoFromCategory(page, category_link, products)
  }
  await browser.close()
  console.log('-----------------------------------------------------')
  console.log('Done parsing')
  const data = JSON.stringify(products)
  fs.writeFile('result.json', data, (err) => {
    if (err) {
      console.log('Done parsing')
      console.error('Problem with saving the file ', err)
    }
    console.log('Exported the products to result.json')
  })
})()

/**
 * Extracts neccesary info from each category
 * @param {*} page
 * @param {*} category_link
 */
async function extractInfoFromCategory(page, category_link) {
  await page.goto(category_link)
  subcategory_links = await extractLinks(page, '.subcategory-link')
  promises = []
  //creates promise so we can wait for all to complete before running another category
  for (const subcategory_link of subcategory_links) {
    promises.push(
      new Promise((resolve, reject) => {
        extractInfoFromSubcategory(subcategory_link, resolve)
      }),
    )
  }
  //run all and wait for them to finish
  await Promise.all(promises)
}

/**
 * Runs each subcategory in its own browser, waits for it to finish and closes the browser
 * @param {*} subcategory_link link for the subcategory
 * @param {*} resolve -> let calling function know we are done
 */
async function extractInfoFromSubcategory(subcategory_link, resolve) {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  await page.goto(subcategory_link)
  product_links = await extractLinks(page, '.title')
  // extract links
  for (const product_link of product_links) {
    await extractInfoFromProduct(page, product_link)
  }
  console.log('Scraped subcategory', subcategory_link)
  await browser.close()
  resolve()
}

/**
 * Extracts info from page of single product and adds it to products array
 * @param {*} page -> page used to navigate to the link
 * @param {*} product_link -> link to navigate to
 */
async function extractInfoFromProduct(page, product_link) {
  let default_price = 0
  let option_prices = {}
  let colors = []
  try {
    await page.goto(product_link)
    //find out if we got dropdown or swatch
    const swatches = await page.$$('.swatches')
    const common_element = await page.$('.col-lg-10')
    product_info = await extractProductInfo(page)
    // check if we have swatches
    if (swatches) {
      option_prices = await extractOptionWithPriceForSwatch(page)
    }
    //force so we dont wait if its not on page
    const dropdown = await page.$('[aria-label="color"]', { force: true })
    // check if we have dropdown (for color)
    if (dropdown) {
      colors = await extractColor(dropdown)
      default_price = await extractPrice(page)
    }
    const number_of_reviews = await extractNumberOfRatings(common_element)
    const number_of_stars = await extractNoStars(common_element)
    products.push({
      product_info: product_info,
      options: option_prices,
      default_price: default_price,
      colors: colors,
      number_of_ratings: number_of_reviews,
      number_of_stars: number_of_stars,
    })
  } catch (err) {
    //TODO needs better handling
    console.log('Error parsing product', product_link, 'err:', err)
  }
}

/**
 * Extracts urls based on class
 * @param {*} common_element -> page object from playwright
 * @param {*} class_name  -> class name to filter out elements
 * @returns array of links contained in elements
 */
async function extractLinks(common_element, class_name) {
  return await common_element.$$eval(class_name, (e) => e.map((s) => s.href))
}

/**
 * Extracts product info on provided page, extracts name, description and URL
 * @param {*} page -> page to get url
 * @returns dict of description of the product with extracted information
 */
async function extractProductInfo(page) {
  const name = await page.$eval('.caption > h4 >> nth=1', (e) => e.innerText)
  const description = await page.textContent('.caption > .description')
  return {
    name: name,
    description: description,
    url: page.url(),
  }
}

/**
 * Extracts price for each option, when the options are based on swatches
 * @param {*} page -> page to search in
 * @returns dict of option : price
 */
async function extractOptionWithPriceForSwatch(page) {
  const swatches = await page.$$('.swatches > .swatch')
  option_prices = {}
  for (const swatch of swatches) {
    let option = await swatch.innerText()
    option = option.trim()
    const price = await extractPrice(page)
    option_prices[option] = price
  }
  return option_prices
}

/**
 * Extracts price from the page
 * @param {*} page -> page to extract items from
 * @returns extracted price
 */
async function extractPrice(page) {
  return await page.textContent('.caption > .price')
}

/**
 * Extracts colors from the page
 * @param {E} page  -> common elem  to extract from
 */
async function extractColor(dropdown) {
  colors = await dropdown.$$eval('option', (options) =>
    options.map((o) => o.innerText),
  )
  //skip first elem (Select Color)
  return colors.slice(1)
}

/**
 * Extracts number of ratings from common element
 * @param {*} common_element -> element to extract the ratings number from
 * @returns number of reviews
 */
async function extractNumberOfRatings(common_element) {
  let n_ratings_unparsed = await common_element.$eval(
    '.ratings > p',
    (p) => p.innerText,
  )
  let n_ratings = parseFloat(n_ratings_unparsed.replace(' reviews', '').trim())
  return n_ratings
}

/**
 * Extracts number of stars for the product
 * @param {*} common_element -> elem to extract from
 * returns number of stars
 */
async function extractNoStars(common_element) {
  ratings_elem = await common_element.$('.ratings')
  no_stars = await ratings_elem.$$eval('span', (spans) => spans.length)
  return no_stars
}
