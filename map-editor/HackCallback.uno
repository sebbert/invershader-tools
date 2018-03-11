using Uno;
using Fuse;
using Fuse.Triggers;
using Fuse.Triggers.Actions;

/**
	Like Callback, but with a specific Visual for VisualEventArgs.
	This is done to avoid `FindByType<Visual>()` returning null and
	giving us a NRE
*/
public class HackCallback : TriggerAction
{
	/** @advanced */
	public Action Action { get; set; }

	/** @advanced */
	public Visual Visual { get; set; }
	
	/** The JavaScript function to be called */
	public event VisualEventHandler Handler;
	
	protected override void Perform(Node target)
	{
		if (Action != null)
			Action();
			
		if (Handler != null)
		{
			var visual = Visual != null
				? Visual
				: target.FindByType<Visual>();
			
			Handler(visual, new VisualEventArgs(visual));
		}
	}
}