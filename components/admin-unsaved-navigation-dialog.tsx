"use client";
import {AdminActionButton,AdminModalDialog} from "@/components/admin-interaction-system";
export function AdminUnsavedNavigationDialog({open,onStay,onLeave,destination}:{
 open:boolean;onStay:()=>void;onLeave:()=>void;destination:string;
}){
 return <AdminModalDialog open={open} title="Neuložené zmeny"
    description={`Ak prejdeš na ${destination}, neuložené úpravy sa stratia.`}
    onClose={onStay} preferExplicitAutofocus
    footer={<>
      <AdminActionButton type="button" variant="neutral" data-admin-autofocus="true"
        onClick={onStay}>Zostať a pokračovať v úpravách</AdminActionButton>
      <AdminActionButton type="button" variant="destructive" onClick={onLeave}>Zahodiť zmeny a pokračovať</AdminActionButton>
    </>}/>;
}
