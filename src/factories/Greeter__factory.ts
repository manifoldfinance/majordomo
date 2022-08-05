/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import { Signer, utils, Contract, ContractFactory, Overrides } from "ethers";
import { Provider, TransactionRequest } from "@ethersproject/providers";
import type { Greeter, GreeterInterface } from "../Greeter";

const _abi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "admin",
        type: "address",
      },
      {
        internalType: "string",
        name: "_greeting",
        type: "string",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "getAdmin",
    outputs: [
      {
        internalType: "address",
        name: "admin",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "greet",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newAdmin",
        type: "address",
      },
    ],
    name: "setAdmin",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "_greeting",
        type: "string",
      },
    ],
    name: "setGreeting",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "_greeting",
        type: "string",
      },
    ],
    name: "setGreetingThatWorks",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const _bytecode =
  "0x60806040523480156200001157600080fd5b5060405162000bf738038062000bf7833981810160405260408110156200003757600080fd5b8151602083018051604051929492938301929190846401000000008211156200005f57600080fd5b9083019060208201858111156200007557600080fd5b82516401000000008111828201881017156200009057600080fd5b82525081516020918201929091019080838360005b83811015620000bf578181015183820152602001620000a5565b50505050905090810190601f168015620000ed5780820380516001836020036101000a031916815260200191505b50606081016040526022808252620001209450909250905062000bd56020830139826200015d60201b620005231760201c565b8051620001359060009060208401906200029c565b5050600180546001600160a01b0319166001600160a01b039290921691909117905562000338565b620002778282604051602401808060200180602001838103835285818151815260200191508051906020019080838360005b83811015620001a95781810151838201526020016200018f565b50505050905090810190601f168015620001d75780820380516001836020036101000a031916815260200191505b50838103825284518152845160209182019186019080838360005b838110156200020c578181015183820152602001620001f2565b50505050905090810190601f1680156200023a5780820380516001836020036101000a031916815260200191505b5060408051601f198184030181529190526020810180516001600160e01b03908116634b5c427760e01b179091529095506200027b169350505050565b5050565b80516a636f6e736f6c652e6c6f67602083016000808483855afa5050505050565b828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f10620002df57805160ff19168380011785556200030f565b828001600101855582156200030f579182015b828111156200030f578251825591602001919060010190620002f2565b506200031d92915062000321565b5090565b5b808211156200031d576000815560010162000322565b61088d80620003486000396000f3fe608060405234801561001057600080fd5b50600436106100575760003560e01c80636e9960c31461005c578063704b6c02146100805780637f98d137146100a8578063a41368621461014e578063cfae3217146101f4575b600080fd5b610064610271565b604080516001600160a01b039092168252519081900360200190f35b6100a66004803603602081101561009657600080fd5b50356001600160a01b0316610280565b005b6100a6600480360360208110156100be57600080fd5b8101906020810181356401000000008111156100d957600080fd5b8201836020820111156100eb57600080fd5b8035906020019184600183028401116401000000008311171561010d57600080fd5b91908080601f0160208091040260200160405190810160405280939291908181526020018383808284376000920191909152509295506102f8945050505050565b6100a66004803603602081101561016457600080fd5b81019060208101813564010000000081111561017f57600080fd5b82018360208201111561019157600080fd5b803590602001918460018302840111640100000000831117156101b357600080fd5b91908080601f0160208091040260200160405190810160405280939291908181526020018383808284376000920191909152509295506103bc945050505050565b6101fc61048d565b6040805160208082528351818301528351919283929083019185019080838360005b8381101561023657818101518382015260200161021e565b50505050905090810190601f1680156102635780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b6001546001600160a01b031690565b6001546001600160a01b031633146102d6576040805162461bcd60e51b81526020600482015260146024820152732727aa2fa0aaaa2427a924ad22a22fa0a226a4a760611b604482015290519081900360640190fd5b600180546001600160a01b0319166001600160a01b0392909216919091179055565b6103a560405180606001604052806023815260200161085e602391396000805460408051602060026001851615610100026000190190941693909304601f8101849004840282018401909252818152929183018282801561039a5780601f1061036f5761010080835404028352916020019161039a565b820191906000526020600020905b81548152906001019060200180831161037d57829003601f168201915b505050505083610630565b80516103b89060009060208401906107ca565b5050565b61043360405180606001604052806023815260200161085e602391396000805460408051602060026001851615610100026000190190941693909304601f8101849004840282018401909252818152929183018282801561039a5780601f1061036f5761010080835404028352916020019161039a565b80516104469060009060208401906107ca565b506040805162461bcd60e51b815260206004820152601660248201527574657374696e67206572726f7220626c6f636b696e6760501b604482015290519081900360640190fd5b60008054604080516020601f60026000196101006001881615020190951694909404938401819004810282018101909252828152606093909290918301828280156105195780601f106104ee57610100808354040283529160200191610519565b820191906000526020600020905b8154815290600101906020018083116104fc57829003601f168201915b5050505050905090565b6103b88282604051602401808060200180602001838103835285818151815260200191508051906020019080838360005b8381101561056c578181015183820152602001610554565b50505050905090810190601f1680156105995780820380516001836020036101000a031916815260200191505b50838103825284518152845160209182019186019080838360005b838110156105cc5781810151838201526020016105b4565b50505050905090810190601f1680156105f95780820380516001836020036101000a031916815260200191505b5060408051601f198184030181529190526020810180516001600160e01b0316634b5c427760e01b17905294506107a99350505050565b6107a483838360405160240180806020018060200180602001848103845287818151815260200191508051906020019080838360005b8381101561067e578181015183820152602001610666565b50505050905090810190601f1680156106ab5780820380516001836020036101000a031916815260200191505b50848103835286518152865160209182019188019080838360005b838110156106de5781810151838201526020016106c6565b50505050905090810190601f16801561070b5780820380516001836020036101000a031916815260200191505b50848103825285518152855160209182019187019080838360005b8381101561073e578181015183820152602001610726565b50505050905090810190601f16801561076b5780820380516001836020036101000a031916815260200191505b5060408051601f198184030181529190526020810180516001600160e01b0316632ced7cef60e01b17905296506107a995505050505050565b505050565b80516a636f6e736f6c652e6c6f67602083016000808483855afa5050505050565b828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061080b57805160ff1916838001178555610838565b82800160010185558215610838579182015b8281111561083857825182559160200191906001019061081d565b50610844929150610848565b5090565b5b80821115610844576000815560010161084956fe4368616e67696e67206772656574696e672066726f6d202725732720746f2027257327a164736f6c634300060c000a4465706c6f79696e67206120477265657465722077697468206772656574696e673a";

type GreeterConstructorParams =
  | [signer?: Signer]
  | ConstructorParameters<typeof ContractFactory>;

const isSuperArgs = (
  xs: GreeterConstructorParams
): xs is ConstructorParameters<typeof ContractFactory> => xs.length > 1;

export class Greeter__factory extends ContractFactory {
  constructor(...args: GreeterConstructorParams) {
    if (isSuperArgs(args)) {
      super(...args);
    } else {
      super(_abi, _bytecode, args[0]);
    }
  }

  deploy(
    admin: string,
    _greeting: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<Greeter> {
    return super.deploy(admin, _greeting, overrides || {}) as Promise<Greeter>;
  }
  getDeployTransaction(
    admin: string,
    _greeting: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): TransactionRequest {
    return super.getDeployTransaction(admin, _greeting, overrides || {});
  }
  attach(address: string): Greeter {
    return super.attach(address) as Greeter;
  }
  connect(signer: Signer): Greeter__factory {
    return super.connect(signer) as Greeter__factory;
  }
  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): GreeterInterface {
    return new utils.Interface(_abi) as GreeterInterface;
  }
  static connect(
    address: string,
    signerOrProvider: Signer | Provider
  ): Greeter {
    return new Contract(address, _abi, signerOrProvider) as Greeter;
  }
}