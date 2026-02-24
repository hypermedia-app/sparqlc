/* eslint-disable mocha/no-global-tests */
import { expect, test } from 'vitest'
import { getByText } from '@testing-library/dom'
import HelloWorld from './HelloWorld.js'

test('renders name', async () => {
  const parent = await HelloWorld()
  document.body.appendChild(parent)

  const element = getByText(parent, 'Hello, Vite!')
  expect(element).toBeInTheDocument()
})
