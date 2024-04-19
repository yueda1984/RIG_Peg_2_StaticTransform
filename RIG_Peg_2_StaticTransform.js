/*
	Peg To Static Transformation

	Creates a series of Static Transformation modules from the selected Peg's keyframe values.
	By converting a Peg to Static modules, you can make the peg un-animatable and also immune to "Reset All Transfomations" function.
	The Static modules will be connected to a Transformation Switch likewise deformer chains.
	This way, each Static modules can be switched based on the selected drawing's cel timings.
	
	v1.1 - Fixed optimizeList() not working properly to filter duplicate items.
	v1.2 - Fixed the issue where created static node is not linked to the same port of the original peg's source node.
	v1.21 - On cloned drawing (Deformation comp node timing ref.), follow the setting of "Animate With Animation Tools" option.
	v1.22 - "drawing.elementMode" attribute is changed to "drawing.ELEMENT_MODE" to accomodate Harmony 22 update.

	
	Installation:
	
	1) Download and Unarchive the zip file.
	2) Locate to your user scripts folder (a hidden folder):
	   https://docs.toonboom.com/help/harmony-17/premium/scripting/import-script.html	
	   
	3) Add all unzipped files (*.js, and script-icons folder) directly to the folder above.
	4) Add RIG_Peg_To_Static_Transformation to any toolbar.	

	
	Direction:
	
	1) Select one Peg and one Drawing module.
	2) Run RIG_Peg_To_Static_Transformation.
	3) Static Modules will be created and connected to a new Transformation Switch module.
	4) The clone of the selected drawing will also be connected to the switch module for switching.
	5) All generated modules will be wrapped inside a group with a prefix "StaticGroup-".
	
	
	Detailed Description:
	
	This script determines the total number of Static modules to generate based on the sum of valid keyframes on the Peg.
	A valid keyframe must have a corresponding drawing cel so a keyframe-cel pair can be formed.
	After a Static module is made based on the keyframe's value, Transformation Switch can use the cel as the reference to select the Static Module.
	When script finds a keyframe on a frame but the exposed cel on the same frame has already been paired with another keyframe, the keyframe will be skipped.
	
	
	                  1         2         3         4         5         6         7         8
	┌─────────────┬───────────────────────────────────────────────────────────────────────────────
	│   Peg       │   ■                   ■                   ■         ■                   ■    
	├─────────────┼────────────────────────────┬───────────────────┬───────────────────┬─────────┬
	│   Drawing   │           CEL 1            │       CEL 2       │                   │  CEL 1  │
	└─────────────┴────────────────────────────┴───────────────────┘                   └─────────┘
	In this scenario, script will only generate Static modules for frame 1 and 5.
	Frame 3 and 8 will be ignored because CEL 1 is already paired with frame 1. Frame 6 will be ignored because it has no exposed cel to pair.

	   
	Author:

		Yu Ueda (raindropmoment.com)
	
	
	Credit:
	
		This script is made based on Animator/Tech Artist Jonathan Murphy's rigging technique. (jonathanrobertart.com)
*/



function RIG_Peg_To_Static_Transformation()
{
	main_function();
	
	function main_function()	
	{	
		var PF = new private_functions;
		
		
		
		//-------------------------------- Checking Selection -------------------------------->	
		
		

		var numOfNodesSelected = selection.numberOfNodesSelected();
		var drawingNode = [], pegNode = [], drawing, peg;
		
		for (var i=0; i<numOfNodesSelected ;i++)
		{
			var sNode = selection.selectedNode(i);
			
			if (node.type(sNode) === "READ")
			{
				drawingNode.push(sNode);
			}	
			else if (node.type(sNode) === "PEG")
			{
				pegNode.push(sNode);
			}	
		}
		
		if (pegNode.length === 1 && drawingNode.length === 1)
		{
			drawing = drawingNode[0];		
			peg = pegNode[0];
		}
		else
		{
			MessageBox.information("Please select one Peg and one Drawing modules. \n\nEach Keyframe on the peg will be converted to a Static Transformation module that is connected to a single Transformation Switch module for switching. \n\nThe drawing will be used by the Transforamtion Switch module as a timing reference for switching in between Static Transformation Modules.");
			return;
		}

		
		
		//-------------------------------- Keyframe Timing List Creation -------------------------------->

		
		
		// Parse through the selected peg to create a list of frame that has least one keyframe:
		var transSettings = PF.getTransformationSettings(peg);
		var pegCols = PF.getColumnList(peg, transSettings);
		var tempKeysList = [];
			
		for (var i = 0; i < pegCols.length; i++)
		{
			var numKeys = func.numberOfPoints(pegCols[i]);
			var colKeysList = [];
			
			for (var ii = 0; ii < numKeys; ii++)
			{
				colKeysList.push(func.pointX(pegCols[i], ii));
			}	
			tempKeysList.push.apply(tempKeysList, colKeysList);
		}
		
		// Stop if selected peg has no keyframe:
		if (tempKeysList.length <= 0)
		{
			MessageBox.information(" No keyframes found on the selected peg. \nCannot create Static Transformation modules.");
			return;
		}
		
		// Remove duplicate items from the list and then sort it in numeric order:
		tempKeysList = PF.optimizeList(tempKeysList);	

		
		// Go to each frame listed on tempKeysList and add the name of cel to celsList.
		// Also add the current frame number to pegKeysList only after added the current cel to celsList for the 1st time.
		// This way, we can ensure that each cel is paired with only one keyframe:
		var useTiming = node.getAttr(drawing, 1, "drawing.ELEMENT_MODE").boolValue();
		var drawColumn = node.linkedColumn(drawing, useTiming ? "drawing.element" : "drawing.customName.timing");
		var celsList = [], pegKeysList = [];
		
		for (var i = 0; i < tempKeysList.length; i++)
		{
			var currentFrame = tempKeysList[i];
			var currentElementFileName = column.getDrawingName (drawColumn, currentFrame);
			var currentElementFrameName = PF.getElementFrameName (currentElementFileName);
			
			if (currentElementFrameName && celsList.indexOf(currentElementFrameName) === -1)
			{
				celsList.push(currentElementFrameName);
				pegKeysList.push(currentFrame);
			}
		}
		
		
		//-------------------------------- Static Module Group Creation -------------------------------->
		
		
		
		var parGroup = node.parentNode(peg);
		var pegSrcInfo = node.srcNodeInfo(peg, 0);
		var pegDstNode = node.dstNode(peg, 0, 0);
		var pegCoord = PF.getCoord(peg);
		
		
		scene.beginUndoRedoAccum("Create Static-Transformation modules from peg keyframes");
		
		
		// Create static modules:
		var newNodeList = [];
		var lastStaticCoord = {x: 100, y: 0};
		
		for (var i = 0; i < pegKeysList.length; i++)
		{
			var newStatic = PF.createNewStatic(pegSrcInfo, parGroup, peg, transSettings, pegKeysList[i], lastStaticCoord);
			newNodeList.push(newStatic);
			lastStaticCoord = PF.getCoord(newStatic);
		}
		
		
		// Create transfomation switch and connect staic modules to it:
		var newTransSwitch = PF.createNewTransSwitch(pegSrcInfo, pegDstNode, parGroup, drawing, newNodeList, celsList);
		var newTransSwitchName = node.getName(newTransSwitch);
		
		
		// Wrap created nodes in to a group:
		newNodeList.push(newTransSwitch);
		var newGroup = PF.wrapInGroup(peg, parGroup, newNodeList, pegCoord);
		
		
		// Create a clone of the selected drawing and parent it to the trans switch:
		var cloneDrawing = PF.createCloneDrawing(drawing, drawColumn, newTransSwitchName, newGroup);
		
		
		// Unlink the selected peg and add surfix "-backup" at the end:
		node.unlink(peg, 0);
		node.rename(peg, node.getName(peg) + "-backup");
		selection.clearSelection();
			
		
		scene.endUndoRedoAccum();
	}



	function private_functions()
	{
		this.optimizeList = function(array)
		{
			array = array.filter(function(elem, index, self)
			{
				return index === self.indexOf(elem);
			});
				
			array.sort(function(elem1, elem2)
			{
				return elem1 - elem2;
			});
			
			return array;
		};
		
		
		this.getElementFrameName = function(fileName)
		{
			var elementFileNameSplit = fileName.split("-");
			var elementFrameName = elementFileNameSplit[elementFileNameSplit.length - 1].replace(".tvg", "");
			var elementFrameNameSplit = elementFrameName.split("+");
			
			return elementFrameNameSplit[0];
		};
		
		
		this.getUniqueName = function(argName, group)
		{
			var suffix = 0;
			var originalName = argName;
	 
			while (node.getName(group + "/" + argName))
			{
				suffix ++;
				argName = originalName + "_" + suffix;	
			}
		
			return argName;
		};
		
		
		this.getUniqueStaticName = function(group)
		{
			var suffix = 0;
			var newName = "";

			do
			{
				suffix ++;
				newName = "Static" + suffix;	
			}
			while (node.getName(group + "/" + newName));
		
			return newName;
		};


		this.getTransformationSettings = function(argNode)
		{
			var settingList = {};
			settingList["3d_enabled"] = node.getAttr(argNode, 1, "enable3d").boolValue();
			settingList["pos_separate"] = node.getAttr(argNode, 1, "position.separate").boolValue();		
			settingList["scale_separate"] = node.getAttr(argNode, 1, "scale.separate").boolValue();		
			settingList["rot_separate"] = node.getAttr(argNode, 1, "rotation.separate").boolValue();
			
			return settingList;
		};
		
		
		this.getColumnList = function(argNode, settingList)
		{
			var colList = [];
			
			
			// Position
			if (settingList["pos_separate"])
			{
				colList.push(node.linkedColumn(argNode, "position.x"));	
				colList.push(node.linkedColumn(argNode, "position.y"));	
				colList.push(node.linkedColumn(argNode, "position.z"));	
			}
			else
			{	
				colList.push(node.linkedColumn(argNode, "position.attr3dpath"));	
			}
			
			
			// Scale
			if (settingList["scale_separate"])
			{
				colList.push(node.linkedColumn(argNode, "scale.x"));
				colList.push(node.linkedColumn(argNode, "scale.y"));

				if (settingList["3d_enabled"])
				{
					colList.push(node.linkedColumn(argNode, "scale.z"));
				}
			}
			else
			{
				colList.push(node.linkedColumn(argNode, "scale.xy"));
			}
			
			
			// Rotation
			if (settingList["3d_enabled"])
			{	
				if (settingList["rot_separate"])
				{
					colList.push(node.linkedColumn(argNode, "rotation.anglex"));	
					colList.push(node.linkedColumn(argNode, "rotation.angley"));	
					colList.push(node.linkedColumn(argNode, "rotation.anglez"));			
				}
				else
				{
					colList.push(node.linkedColumn(argNode, "rotation.quaternionpath"));
				}
			}
			else
			{
				colList.push(node.linkedColumn(argNode, "rotation.anglez"));	
			}
			
			
			// Skew
			colList.push(node.linkedColumn(argNode, "skew"));
			
			return colList;
		};
		
		
		this.getCoord = function(argNode)
		{
			newX = node.coordX(argNode);
			newY = node.coordY(argNode);
			
			return {x: newX, y: newY};
		};
		
		
		this.getAverageCoord = function(node0, node1)
		{
			newX = (node.coordX(node0) + node.coordX(node1)) /2;
			newY = (node.coordY(node0) + node.coordY(node1)) /2;
			
			return {x: newX, y: newY};
		};
		
		
		this.createNewStatic = function(srcNodeInfo, group, argNode, settingList, keyframeTiming, coord)
		{	
			var newStaticName = this.getUniqueStaticName(group);
			var newStatic = node.add(group, newStaticName, "StaticConstraint", coord.x - 75, coord.y + 25, 0);
			node.setTextAttr(newStatic, "active", 0, "TRUE");
		
		
			//---------------------- Passing the current-frame values of the peg to the static ---------------------->
					
			
			// Position	
			var posXCol = node.getTextAttr(argNode, keyframeTiming, settingList["pos_separate"] ? "position.x" : "position.3dpath.x");
			var posYCol = node.getTextAttr(argNode, keyframeTiming, settingList["pos_separate"] ? "position.y" : "position.3dpath.y");
			var posZCol = node.getTextAttr(argNode, keyframeTiming, settingList["pos_separate"] ? "position.z" : "position.3dpath.z");	
			node.setTextAttr(newStatic, "translate.x", 0, posXCol);
			node.setTextAttr(newStatic, "translate.y", 0, posYCol);
			node.setTextAttr(newStatic, "translate.z", 0, posZCol);	
				
				
			// Scale
			if (settingList["scale_separate"])
			{
				var scaleXCol = node.getTextAttr(argNode, keyframeTiming, "scale.x");
				var scaleYCol = node.getTextAttr(argNode, keyframeTiming, "scale.y");
				node.setTextAttr(newStatic, "scale.x", 0, scaleXCol);
				node.setTextAttr(newStatic, "scale.y", 0, scaleYCol);	
				
				if (settingList["3d_enabled"])
				{
					var scaleZCol = node.getTextAttr(argNode, keyframeTiming, "scale.z");		
					node.setTextAttr(newStatic, "scale.z", 0, scaleZCol);
				}
			}
			else
			{
				var scaleXYCol = node.getTextAttr(argNode, keyframeTiming, "scale.xy");
				node.setTextAttr(newStatic, "scale.separate", 0, "FALSE");
				node.setTextAttr(newStatic, "scale.xy", 0, scaleXYCol);
			}		
			
			
			// Rotation
			if (settingList["3d_enabled"])
			{	
				if (settingList["rot_separate"])
				{
					var rotXCol = node.getTextAttr(argNode, keyframeTiming, "rotation.anglex");
					var rotYCol = node.getTextAttr(argNode, keyframeTiming, "rotation.angley");
					var rotZCol = node.getTextAttr(argNode, keyframeTiming, "rotation.anglez");	
				}
				else
				{
					var rotXYZColName = node.linkedColumn(argNode, "rotation.quaternionpath");
					var rotXCol = column.getEntry (rotXYZColName, 1, keyframeTiming);
					var rotYCol = column.getEntry (rotXYZColName, 2, keyframeTiming);
					var rotZCol = column.getEntry (rotXYZColName, 3, keyframeTiming);
				}
				node.setTextAttr(newStatic, "rotate.anglex", 0, rotXCol);
				node.setTextAttr(newStatic, "rotate.angley", 0, rotYCol);
				node.setTextAttr(newStatic, "rotate.anglez", 0, rotZCol);			
			}
			else
			{
				var rotZCol = node.getTextAttr(argNode, keyframeTiming, "rotation.anglez");
				node.setTextAttr(newStatic, "rotate.anglez", 0, rotZCol);	
			}

			
			// Skew
			var skewCol = node.getTextAttr(argNode, keyframeTiming, "skew");
			node.setTextAttr(newStatic, "skewx", 0, skewCol);
				
			node.link(srcNodeInfo.node, srcNodeInfo.port, newStatic, 0, false, false);

			return newStatic;
		};
		
		
		this.createNewTransSwitch = function(srcNodeInfo, childNode, group, drawing, staticList, celsList)
		{		
			var newSwitchCoord = this.getAverageCoord(staticList[0], staticList[staticList.length -1]);
			var newSwitchName = this.getUniqueName("Transformation-Switch", group);
			var newSwitch = node.add(group, newSwitchName, "TransformationSwitch", newSwitchCoord.x, newSwitchCoord.y + 100, 0);

			
			// Link drawing column of the selected drawing with the switch:
			var useTiming = node.getAttr(drawing, 1, "drawing.ELEMENT_MODE").boolValue();
			var drawColumn = node.linkedColumn(drawing, useTiming ? "drawing.element" : "drawing.customName.timing");		
			node.setTextAttr(newSwitch, "drawing.ELEMENT_MODE", 1, useTiming ? "On" : "Off");
			node.linkAttr(newSwitch, useTiming ? "drawing.element" : "drawing.customName.timing", drawColumn);			
			
			
			// Connect each static module to the switch and add cel name to transformation name attribute:		
			for (var i = 0; i < staticList.length; i++)
			{
				node.link(staticList[i], 0, newSwitch, i +1, false, true);
				var str = celsList[i] + ";";
				for (c = 1; c <= 100; c++)
				{
					str += celsList[i] + "+" + c + ";";
				}
				node.setTextAttr(newSwitch, "transformationnames.transformation" + (i +1), 1, str);	
			}	
			node.link(srcNodeInfo.node, srcNodeInfo.port, newSwitch, 0, false, false);
			node.unlink(childNode, 0);
			node.link(newSwitch, 0, childNode, 0, false, false);
			
			return newSwitch;
		};
		
		
		this.wrapInGroup = function(argNode, group, nodeList, coord)
		{				
			var pegName = node.getName(argNode, group);
			
			if (pegName.indexOf("-p") !== -1)
			{
				pegName = pegName.replace("-p", "");
			}
			else if (pegName.indexOf("-P") !== -1)
			{
				pegName = pegName.replace("-P", "");
			}
			
			var newGroupName = this.getUniqueName("StaticGroup-" + pegName, group);
			var newGroup = node.createGroup(nodeList, newGroupName);
			node.setCoord(newGroup, coord.x -25, coord.y +25);
			
			return newGroup;
		};
		
		
		this.createCloneDrawing = function(drawing, drawCol, switchName, newGroup)
		{
			var drawingName = node.getName(drawing);			
			var cloneDrawing = node.add(newGroup, drawingName + "-CLONE", "READ", 50, 150, 0);		
			node.linkAttr(cloneDrawing, "drawing.element", drawCol);
			if (!node.getAttr(drawing, 1, "canAnimate").boolValue())
				node.setTextAttr(cloneDrawing, "canAnimate", 1, false);
			node.setEnable(cloneDrawing, false);
					
			node.link(newGroup + "/" + switchName, 0, cloneDrawing, 0, false, false);
			node.unlink(newGroup + "/" + "Multi-Port-Out", 1);
			node.deleteNode(newGroup + "/" + "Composite");
		};
	}
}