export class BaseBuilder<InternalType> {
    /** @internal */
    protected _internal: InternalType;

    constructor(initial: InternalType) {
        this._internal = initial;
    }

    static from_data<B extends BaseBuilder<any>, D>(
        this: new (data?: D) => B,
        data: D
    ): B {
        const instance = new this();
        instance._internal = structuredClone(data);
        return instance;
    }

    clone(): this {
        return (this.constructor as any).from_data(this._internal);
    }
}
