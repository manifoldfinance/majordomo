/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import {
  BaseContract,
  BigNumber,
  BytesLike,
  CallOverrides,
  ContractTransaction,
  Overrides,
  PopulatedTransaction,
  Signer,
  utils,
} from "ethers";
import { FunctionFragment, Result } from "@ethersproject/abi";
import { Listener, Provider } from "@ethersproject/providers";
import { TypedEventFilter, TypedEvent, TypedListener, OnEvent } from "./common";

export interface GreeterInterface extends utils.Interface {
  functions: {
    "getAdmin()": FunctionFragment;
    "greet()": FunctionFragment;
    "setAdmin(address)": FunctionFragment;
    "setGreeting(string)": FunctionFragment;
    "setGreetingThatWorks(string)": FunctionFragment;
  };

  encodeFunctionData(functionFragment: "getAdmin", values?: undefined): string;
  encodeFunctionData(functionFragment: "greet", values?: undefined): string;
  encodeFunctionData(functionFragment: "setAdmin", values: [string]): string;
  encodeFunctionData(functionFragment: "setGreeting", values: [string]): string;
  encodeFunctionData(
    functionFragment: "setGreetingThatWorks",
    values: [string]
  ): string;

  decodeFunctionResult(functionFragment: "getAdmin", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "greet", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "setAdmin", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "setGreeting",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setGreetingThatWorks",
    data: BytesLike
  ): Result;

  events: {};
}

export interface Greeter extends BaseContract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  interface: GreeterInterface;

  queryFilter<TEvent extends TypedEvent>(
    event: TypedEventFilter<TEvent>,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TEvent>>;

  listeners<TEvent extends TypedEvent>(
    eventFilter?: TypedEventFilter<TEvent>
  ): Array<TypedListener<TEvent>>;
  listeners(eventName?: string): Array<Listener>;
  removeAllListeners<TEvent extends TypedEvent>(
    eventFilter: TypedEventFilter<TEvent>
  ): this;
  removeAllListeners(eventName?: string): this;
  off: OnEvent<this>;
  on: OnEvent<this>;
  once: OnEvent<this>;
  removeListener: OnEvent<this>;

  functions: {
    getAdmin(overrides?: CallOverrides): Promise<[string] & { admin: string }>;

    greet(overrides?: CallOverrides): Promise<[string]>;

    setAdmin(
      newAdmin: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    setGreeting(
      _greeting: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    setGreetingThatWorks(
      _greeting: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;
  };

  getAdmin(overrides?: CallOverrides): Promise<string>;

  greet(overrides?: CallOverrides): Promise<string>;

  setAdmin(
    newAdmin: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  setGreeting(
    _greeting: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  setGreetingThatWorks(
    _greeting: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  callStatic: {
    getAdmin(overrides?: CallOverrides): Promise<string>;

    greet(overrides?: CallOverrides): Promise<string>;

    setAdmin(newAdmin: string, overrides?: CallOverrides): Promise<void>;

    setGreeting(_greeting: string, overrides?: CallOverrides): Promise<void>;

    setGreetingThatWorks(
      _greeting: string,
      overrides?: CallOverrides
    ): Promise<void>;
  };

  filters: {};

  estimateGas: {
    getAdmin(overrides?: CallOverrides): Promise<BigNumber>;

    greet(overrides?: CallOverrides): Promise<BigNumber>;

    setAdmin(
      newAdmin: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    setGreeting(
      _greeting: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    setGreetingThatWorks(
      _greeting: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;
  };

  populateTransaction: {
    getAdmin(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    greet(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    setAdmin(
      newAdmin: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    setGreeting(
      _greeting: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    setGreetingThatWorks(
      _greeting: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;
  };
}