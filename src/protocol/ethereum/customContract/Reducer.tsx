import { useState, useContext, useEffect, useMemo } from 'react'
import { useToasts } from 'react-toast-notifications'
import { logger } from 'logger/customLogger'
import Notify from 'bnc-notify'
import omit from 'lodash.omit'

import * as utils from 'utils'
import * as consts from 'consts'
import * as contexts from 'contexts'
import { EmitterContext } from 'providers/EmitterProvider/context'

import { useAddInvokeTrigger } from './useAddInvokeTrigger'
import { useAutoInvokeMethod } from './useAutoInvokeMethod'
import { useDisplayResults } from './useDisplayResults'

import { sendTx } from './sendTx'
import { callMethod } from './callMethod'

const blockNativeApiKey = process.env.REACT_APP_BLOCKNATIVE_API
const { AUTO_INVOKE_INTERVAL: POLLING_INTERVAL } = consts.global

// Utils
const notify = (apiKey, chainId) => Notify({ dappId: apiKey, networkId: chainId })

const getAbiMethodInputs = (abi, methodName): Record<string, any> => {
  const emptyString = '$true'
  const parseName = (value: string): string => (value === '' ? emptyString : value)

  const method = abi.find(({ name }) => name === methodName)
  const parsedMethod = Object.assign(method, { inputs: method.inputs.map((input) => ({ ...input, name: parseName(input.name) })) })

  const output = parsedMethod.inputs.reduce((acc, { name }) => ({ ...acc, [name]: '' }), [])
  return output
}

// Reducer Component
export const Reducer = ({ info, readContract, writeContract, readEnabled, readChainId, writeEnabled }) => {

  const {
    childrenElements,
    properties,
    hasInputs,
    isTransaction,
  } = info

  // TODO Check for Overloaded Functions
  const autoClearKey = properties.find(({ key }) => key === 'autoClear')
  const autoInvokeKey = properties.find(({ key }) => key === 'autoInvoke')
  const methodNameKey = properties.find(({ key }) => key === 'methodName')
  const ethValueKey = properties.find((property) => property.key === 'ethValue')

  let ethValue = ethValueKey?.value
  const { value: methodName } = methodNameKey

  const { actions: { emitToEvent } } = useContext(EmitterContext)

  // Create a write Provider from the injected ethereum context
  const { provider, isEnabled, chainId, address } = useContext(contexts.EthereumContext)

  // Toast Notifications
  const { addToast } = useToasts()
  const errorToast = ({ message }): void => addToast(message, { appearance: 'error' })
  const infoToast = ({ message }): void => addToast(message, { appearance: 'info' })

  // React hooks
  const [ result, setResult ] = useState(null)
  const [ parametersValues, setParametersValues ] = useState([])
  console.log('Reducer -> parametersValues', parametersValues)
  // Helpers - Get parameters values

  useEffect(() => {
    const inputChildrens = childrenElements.filter(({ id }) => id.includes('input'))
    const abiMethodInputs = getAbiMethodInputs(info.contract.contractAbi, methodName)

    // if (!inputChildrens.length ) setParametersValues({ parameterValues: [] })
    const rawValues = []
    const getInputs = () => {
      const [ inputs ] = inputChildrens

      inputs.element.forEach(({ element, argumentName }) => {
        // TODO: [DEV-258] This works only on the first pass. If we change addreses, it does not update.

        const rawValue = element.value
        rawValues.push({ element, rawValue })
        console.log('Reducer -> rawValues', rawValues)
        const value = address ? (rawValue.replace(consts.clientSide.currentUser, address) ?? rawValue) : rawValue

        try {
          const displayUnits = element.getAttribute('data-dh-modifier-display-units')
          const contractUnits = element.getAttribute('data-dh-modifier-contract-units')
          const convertedValue = value && (displayUnits || contractUnits) ? utils.convertUnits(displayUnits, contractUnits, value) : value

          if (convertedValue) {
            Object.assign(abiMethodInputs, { [argumentName]: convertedValue })
          }
        } catch (err) {
          console.warn('There may be an issue with your inputs')
        }

        // TODO: Check if we need to re-assign the input value (with Drake)
        element.value = value
      })

      if (abiMethodInputs?.EthValue) {
        ethValue = abiMethodInputs?.EthValue
      }

      const parsedParameters = omit(abiMethodInputs, 'EthValue')
      const paramVals = Object.values(parsedParameters)
      setParametersValues([ ...paramVals ])
    }
    if (inputChildrens.length ) getInputs()
    return () => {
      rawValues.map((el) => {
        console.log('Reducer -> el', el)
        el.element.value = el.rawValue
      })
    }
  }, [ address, chainId ])

  // -> Handlers
  const handleRunMethod = async (event = null, shouldClearInput = false): Promise<void> => {

    // Return early if the read and write instances aren't ready
    // if (!readEnabled && !writeEnabled) return null

    // const { parametersValues } = getParametersFromInputValues()
    console.log('parametersValues', parametersValues)

    if (event) {
      try {
        event.preventDefault()
        event.stopPropagation()
      } catch (err) {}
    }

    if (hasInputs) {
      const isParametersFilled = Boolean(parametersValues.filter(Boolean).join(''))
      if (!isParametersFilled) console.error(`You must define your parameters first`)
    }

    try {
      let value = '0'
      const methodParams = [ ...(hasInputs ? parametersValues : []) ]

      if (ethValue) {
        value = ethValue
      }

      if (writeEnabled && isTransaction) {
        const methodHash = await sendTx({
          writeContract,
          provider,
          methodName,
          methodParams,
          value,
          notify: notify(blockNativeApiKey, chainId),
        })
        setResult(methodHash)
      } else if (readEnabled && !isTransaction) {
        const methodResult = await callMethod({ readContract, methodName, methodParams, infoToast })
        setResult(methodResult)
      }

      const [ input ] = childrenElements.filter(({ id }) => id.includes('input'))
      const { value: autoInvokeValue } = autoInvokeKey || { value: false }
      const shouldAutoInvoke = autoInvokeValue === 'true'
      const shouldClearAllInputValues = input?.element && !shouldAutoInvoke && shouldClearInput

      if (shouldClearAllInputValues) {
        input.element.forEach(({ element }) => Object.assign(element, { value: '' }))
      }

    } catch (err) {
      logger.error('Custom Contract handleRun method failed\n', err)
      errorToast({ message: 'Error. Check the Console.' })
    }
  }

  // Add trigger to invoke buttons
  useAddInvokeTrigger({ info, autoClearKey, handleRunMethod })

  // Auto invoke method
  useAutoInvokeMethod({
    info,
    autoInvokeKey,
    autoClearKey,
    isTransaction,
    handleRunMethod,
    readEnabled,
    readContract,
    readChainId,
    POLLING_INTERVAL,
    writeAddress: address,
    parametersValues,
  })

  // Display new results in the UI
  useDisplayResults({ childrenElements, result, emitToEvent })

  return null
}
