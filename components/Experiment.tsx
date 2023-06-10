import Link from "next/link";
import { PropsWithChildren } from "react";

interface ExperimentProps {
    heading: string;
    subheading: string;
    link: string;
}

export const Experiment: React.FC<PropsWithChildren<ExperimentProps>> = ({
    heading,
    subheading,
    link,
    children,
}) => {
    return (
        <>
            <div className="p-4 border rounded-lg grid grid-cols-1 md:grid-cols-3 gap-4 shadow-md">
                <div className="bg-green-50 rounded-lg p-4 flex flex-col gap-2 md:gap-4 items-center">
                    <div className="text-center text-xl font-bold">{heading}</div>
                    <div className="text-center text-lg">{subheading}</div>
                    <Link
                        href={link}
                        className="flex items-center justify-center bg-teal-600 text-white p-3 rounded-md hover:bg-teal-700"
                    >
                        Check it out
                    </Link>
                </div>
                <div className="md:col-span-2">{children}</div>
            </div>
        </>
    );
};
