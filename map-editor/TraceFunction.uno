using Uno;
using Uno.UX;
using Fuse;
using Fuse.Reactive;

[UXFunction("trace")]
public class TraceFunction : SimpleVarArgFunction
{
	protected override void OnNewArguments(Argument[] args, IListener listener)
	{
		var value = args[0].Value;
		var displayValue = value == null ? "<null>" : value.ToString();

		string displayName = "<unknown>";
		if (args.Length > 1) {
			displayName = (string)args[1].Value;
		}

		debug_log "trace(): " + displayName + " = " + displayValue;
		
		listener.OnNewData(this, value);
	}
	
	public override string ToString()
	{
		return FormatString("trace");
	}
}